import sys
import os
import json

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db_client import db

def test_logic():
    doc_id = "deliveryCommand_1780718644742_9hijix"
    slot = 1
    status = "failed"
    reason = "timeout"
    
    print(f"Testing logic for docId={doc_id}, slot={slot}, status={status}, reason={reason}")
    doc_ref = db.collection("deliveryCommands").document(doc_id)
    doc = doc_ref.get()
    print(f"Doc exists: {doc.exists}")
    if doc.exists:
        doc_data = doc.to_dict()
        print(f"Doc keys: {list(doc_data.keys())}")
        bins = doc_data.get("bins", [])
        print(f"Bins before: {json.dumps(bins, ensure_ascii=True)}")
        for bin_item in bins:
            if bin_item.get("slot") == slot:
                bin_item["status"] = status
                if status == "failed":
                    bin_item["failureReason"] = reason
        
        updates = {"bins": bins}

        # Check if all bins are resolved
        if bins and all(bin_item.get("status") in ["delivered", "failed"] for bin_item in bins):
            has_failed = any(bin_item.get("status") == "failed" for bin_item in bins)
            final_status = "failed" if has_failed else "delivered"
            updates["status"] = final_status

        print(f"Prepared updates: {json.dumps(updates, ensure_ascii=True)}")
        success = doc_ref.update(updates)
        print(f"Updates status: {success}")
        
        # Verify
        updated_doc = doc_ref.get().to_dict()
        print(f"Bins after update: {json.dumps(updated_doc.get('bins'), ensure_ascii=True)}")
        print(f"Overall status: {updated_doc.get('status')}")

if __name__ == "__main__":
    test_logic()
