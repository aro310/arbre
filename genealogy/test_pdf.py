import requests
import json

data = {
    "width": 1000,
    "height": 800,
    "nodes": [
        {"id": 1, "x": 100, "y": 100, "statusColor": "#2f855a", "photo": None, "name_lines": ["Alice"], "dates": "1990 - "}
    ],
    "links": [
        {"x1": 100, "y1": 100, "x2": 200, "y2": 200, "color": "#9ca3af", "width": 2}
    ],
    "texts": []
}

response = requests.post("http://127.0.0.1:8000/api/export-pdf/", json=data)
if response.status_code == 200:
    print("PDF export successful, size:", len(response.content))
    with open("test_out.pdf", "wb") as f:
        f.write(response.content)
else:
    print("PDF export failed:", response.status_code, response.text)
