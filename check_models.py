import urllib.request
import json

from config import API_KEY
url = f'https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}'

try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        models = data.get('models', [])
        print("Available Models:")
        for m in models:
            if 'generateContent' in m.get('supportedGenerationMethods', []):
                print(f"- {m['name']}")
except Exception as e:
    print(f"Error: {e}")
