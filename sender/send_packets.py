# sender/send_packets.py
import csv
import json
import time
import sys
import requests
from typing import Dict, Any

CSV_FILE = "/app/data/ip_addresses.csv"      
SERVER_URL = "http://backend:5000/package"    

SPEED_MULTIPLIER = 50

def send_packet(packet: Dict[str, Any]) -> bool:
    try:
        response = requests.post(SERVER_URL, json=packet, timeout=5)
        if response.status_code == 200:
            print(f"[+] Sent: {packet['ip']} | ts={packet['timestamp']} | susp={packet['suspicious']}")
            return True
        else:
            print(f"[-] Error {response.status_code} during sending {packet['ip']}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[!] Net error during sending {packet['ip']}: {e}")
        return False

def main():
    print("=== Run the traffic generator ===")
    print(f"Reading data from {CSV_FILE}")

    packets = []
    try:
        with open(CSV_FILE, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                clean_row = {k.strip(): v.strip() for k, v in row.items() if k}
                
                packet = {
                    "ip": clean_row["ip address"],
                    "latitude": float(clean_row["Latitude"]),
                    "longitude": float(clean_row["Longitude"]),
                    "timestamp": int(float(clean_row["Timestamp"])),
                    "suspicious": int(float(clean_row["suspicious"]))
                }
                packets.append(packet)
    except FileNotFoundError:
        print(f"Error: file {CSV_FILE} is not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error during reading CSV: {e}")
        sys.exit(1)

    if not packets:
        print("No data for sending")
        return

    print(f"Loaded {len(packets)} packets. Start sending...")

    prev_timestamp = packets[0]["timestamp"]
    send_packet(packets[0])

    for i in range(1, len(packets)):
        current = packets[i]
        delta = current["timestamp"] - prev_timestamp

        if delta > 0:
            sleep_time = delta / SPEED_MULTIPLIER
            if sleep_time > 0.05:
                time.sleep(sleep_time)

        send_packet(current)
        prev_timestamp = current["timestamp"]

    print("=== All packets are sent ===")

if __name__ == "__main__":
    main()