import requests
import json

# Fetch tree data
res = requests.get("http://127.0.0.1:8000/api/arbre/")
data = res.json()

# Reconstruct frontend behavior: base64 encode photos
import base64
payload_nodes = []
for n in data['nodes']:
    photo_b64 = None
    if n.get('photo'):
        try:
            r = requests.get("http://127.0.0.1:8000" + n['photo'])
            b64 = base64.b64encode(r.content).decode('ascii')
            # The JS actually prepends data url
            content_type = r.headers['content-type']
            photo_b64 = f"data:{content_type};base64,{b64}"
        except Exception:
            pass
            
    payload_nodes.append({
        "x": 100, "y": 100, "statusColor": "#2f855a", "photo": photo_b64, "r": 30, "photo_r": 25, "name_lines": [n['name']], "dates": "2000-2024"
    })

payload = {
    "width": 2000,
    "height": 1000,
    "nodes": payload_nodes,
    "links": [],
    "texts": []
}

export_res = requests.post("http://127.0.0.1:8000/api/export-pdf/", json=payload)
print("Status Code:", export_res.status_code)
if export_res.status_code == 200:
    print("Success, PDF length:", len(export_res.content))
else:
    print("Error:", export_res.text)
