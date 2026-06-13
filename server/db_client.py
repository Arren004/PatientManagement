import urllib.request
import urllib.error
import json
import threading
import time
import base64
from utils import safe_print as print

COUCHDB_URL = "http://localhost:5984"
DB_NAME = "smarthospital"
AUTH_USER = "admin"
AUTH_PASS = "admin"

# Tạo basic auth header
auth_str = f"{AUTH_USER}:{AUTH_PASS}"
auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
HEADERS = {
    "Authorization": f"Basic {auth_b64}",
    "Content-Type": "application/json"
}

def couch_request(url, method="GET", data=None, timeout=10, is_stream=False):
    req_data = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, headers=HEADERS, method=method, data=req_data)
    
    if is_stream:
        return urllib.request.urlopen(req, timeout=None) # stream không set timeout
        
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.status
            body = response.read().decode('utf-8')
            return status_code, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8') if e else ""
        try:
            err_json = json.loads(body) if body else {}
        except:
            err_json = {}
        return e.code, err_json
    except Exception as e:
        return 500, {"error": str(e)}

class CouchDocument:
    def __init__(self, data, exists=True):
        self._data = data
        self.id = data.get("_id")
        self.exists = exists and data is not None and "_id" in data

    def to_dict(self):
        return self._data

class CouchCollectionQuery:
    def __init__(self, col_name, filters=None):
        self.col_name = col_name
        self.doc_type = self._map_col_to_type(col_name)
        self.filters = filters or {}

    def _map_col_to_type(self, col_name):
        if col_name in ["Users", "users"]: return "user"
        if col_name == "Patients": return "patient"
        if col_name == "robots": return "robot"
        if col_name == "deliveryCommands": return "deliveryCommand"
        if col_name == "systemLogs": return "systemLog"
        if col_name == "rooms": return "room"
        return col_name

    def where(self, field, op, value):
        new_filters = dict(self.filters)
        if op == "!=":
            new_filters[field] = {"$ne": value}
        elif op == "==":
            new_filters[field] = value
        return CouchCollectionQuery(self.col_name, new_filters)

    def stream(self):
        url = f"{COUCHDB_URL}/{DB_NAME}/_find"
        selector = {"type": self.doc_type}
        for k, v in self.filters.items():
            selector[k] = v
        
        status, res = couch_request(url, method="POST", data={"selector": selector, "limit": 1000})
        if status == 200:
            docs = res.get("docs", [])
            return [CouchDocument(d) for d in docs]
        return []

    def on_snapshot(self, callback):
        def watch_thread():
            seen_ids = set()
            since = "now"
            url = f"{COUCHDB_URL}/{DB_NAME}/_changes?feed=continuous&include_docs=true&heartbeat=10000&since={since}"
            while True:
                response = None
                try:
                    response = couch_request(url, method="GET", is_stream=True)
                    while True:
                        line = response.readline()
                        if not line:
                            break
                        decoded_line = line.decode('utf-8').strip()
                        if not decoded_line:
                            continue
                        try:
                            change = json.loads(decoded_line)
                        except json.JSONDecodeError:
                            continue
                        doc = change.get("doc")
                        if doc and doc.get("type") == self.doc_type:
                            doc_id = doc.get("_id")
                            match = True
                            for field, filter_val in self.filters.items():
                                doc_val = doc.get(field)
                                if isinstance(filter_val, dict) and "$ne" in filter_val:
                                    if doc_val == filter_val["$ne"]:
                                        match = False
                                elif doc_val != filter_val:
                                    match = False
                            
                            if match:
                                is_new = doc_id not in seen_ids
                                seen_ids.add(doc_id)
                                class MockType:
                                    name = "ADDED" if is_new else "MODIFIED"
                                class MockChange:
                                    type = MockType()
                                    document = CouchDocument(doc)
                                
                                callback(None, [MockChange()], None)
                            else:
                                seen_ids.discard(doc_id)
                except Exception as e:
                    print(f"[CouchDB Watcher Connection Error] {repr(e)}, retrying in 5s...")
                    time.sleep(5)
                finally:
                    if response:
                        try:
                            response.close()
                        except:
                            pass
        
        threading.Thread(target=watch_thread, daemon=True).start()

_doc_locks = {}
_doc_locks_lock = threading.Lock()

def _get_doc_lock(doc_id):
    with _doc_locks_lock:
        if doc_id not in _doc_locks:
            _doc_locks[doc_id] = threading.Lock()
        return _doc_locks[doc_id]

class CouchDocumentReference:
    def __init__(self, col_name, doc_id):
        self.col_name = col_name
        self.doc_id = doc_id
        self.doc_type = CouchCollectionQuery(col_name).doc_type

    def get(self):
        url = f"{COUCHDB_URL}/{DB_NAME}/{self.doc_id}"
        status, res = couch_request(url, method="GET")
        if status == 200:
            return CouchDocument(res, exists=True)
        return CouchDocument({"_id": self.doc_id}, exists=False)

    def update(self, data, retries=10, delay=0.1):
        lock = _get_doc_lock(self.doc_id)
        with lock:
            url = f"{COUCHDB_URL}/{DB_NAME}/{self.doc_id}"
            for attempt in range(retries):
                status, doc_data = couch_request(url, method="GET")
                if status != 200:
                    doc_data = {}
                
                doc_data.update(data)
                doc_data["type"] = self.doc_type
                
                status_put, put_res = couch_request(url, method="PUT", data=doc_data)
                if status_put in [200, 201]:
                    return True
                
                if status_put == 409:
                    import random
                    jitter = random.uniform(0.05, 0.25)
                    print(f"[CouchDB Update Conflict] PUT to {self.doc_id} failed with 409 conflict. Retrying {attempt + 1}/{retries}...")
                    time.sleep(delay + jitter)
                    continue
                else:
                    print(f"[CouchDB Update Error] PUT to {self.doc_id} failed with status {status_put}: {repr(put_res)}")
                    return False
            return False

    def set(self, data, merge=True, retries=10, delay=0.1):
        lock = _get_doc_lock(self.doc_id)
        with lock:
            url = f"{COUCHDB_URL}/{DB_NAME}/{self.doc_id}"
            for attempt in range(retries):
                doc_data = {}
                if merge:
                    status, res = couch_request(url, method="GET")
                    if status == 200:
                        doc_data = res
                
                doc_data.update(data)
                doc_data["type"] = self.doc_type
                if "_id" not in doc_data:
                    doc_data["_id"] = self.doc_id
                    
                status_put, put_res = couch_request(url, method="PUT", data=doc_data)
                if status_put in [200, 201]:
                    return True
                    
                if status_put == 409:
                    import random
                    jitter = random.uniform(0.05, 0.25)
                    print(f"[CouchDB Set Conflict] PUT to {self.doc_id} failed with 409 conflict. Retrying {attempt + 1}/{retries}...")
                    time.sleep(delay + jitter)
                    continue
                else:
                    print(f"[CouchDB Set Error] PUT to {self.doc_id} failed with status {status_put}: {repr(put_res)}")
                    return False
            return False

class CouchDBClient:
    def collection(self, col_name):
        return CouchCollectionQuery(col_name)

    def document(self, col_name, doc_id):
        return CouchDocumentReference(col_name, doc_id)

CouchCollectionQuery.document = lambda self, doc_id: CouchDocumentReference(self.col_name, doc_id)

db = CouchDBClient()
