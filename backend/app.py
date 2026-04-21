from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

packets_store = []

@app.route('/package', methods=['POST'])
def receive_package():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON provided"}), 400
        
        required_fields = ['ip', 'latitude', 'longitude', 'timestamp', 'suspicious']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing field: {field}"}), 400
        
        data['received_at'] = None
        packets_store.append(data)
        print(f"[+] Got packet from {data['ip']} | All: {len(packets_store)}")
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/packets', methods=['GET'])
def get_packets():
    since = request.args.get('since', type=int)
    if since is not None:
        filtered = [p for p in packets_store if p['timestamp'] > since]
        return jsonify(filtered)
    return jsonify(packets_store)

@app.route('/clear', methods=['POST'])
def clear_packets():
    packets_store.clear()
    return jsonify({"status": "cleared"}), 200

@app.route('/<path:path>')
def send_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    if not os.path.exists('static'):
        os.makedirs('static')
    app.run(host='0.0.0.0', port=5000, debug=True)