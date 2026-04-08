import firebase_admin
from firebase_admin import credentials, initialize_app, firestore

# Khởi tạo firebase admin 
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()
