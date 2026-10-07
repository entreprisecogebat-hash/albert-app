"""
Transcription des commandes vocales d'Albert, sur la machine (faster-whisper, licence MIT).

Expose la même route que l'API OpenAI, POST /v1/audio/transcriptions (multipart : file, language),
pour que l'API Symfony puisse aussi parler à speaches ou à un service hébergé sans changer de code.

Installation (une fois) :
    python -m venv %LOCALAPPDATA%\\albert\\whisper\\venv
    %LOCALAPPDATA%\\albert\\whisper\\venv\\Scripts\\pip install faster-whisper
Lancement :
    %LOCALAPPDATA%\\albert\\whisper\\venv\\Scripts\\python scripts\\whisper-server.py
Le modèle (WHISPER_MODEL, « small » par défaut, ~500 Mo) est téléchargé au premier lancement.
"""

import cgi
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "small")
PORT = int(os.environ.get("WHISPER_PORT", "8010"))

print(f"Chargement du modèle {MODEL}…", flush=True)
model = WhisperModel(MODEL, device="cpu", compute_type="int8")
# Oriente la transcription vers le vocabulaire du chantier.
PROMPT = "Chantier, tâche, rendez-vous, réserve, SAV, plinthes, menuiseries, devis, facture, réunion de chantier."


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._json(200, {"ok": True, "model": MODEL})

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/audio/transcriptions":
            return self._json(404, {"error": "Route inconnue."})
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        if "file" not in form or not getattr(form["file"], "file", None):
            return self._json(400, {"error": "Aucun fichier audio."})
        language = form.getfirst("language", "fr")
        suffix = os.path.splitext(form["file"].filename or "")[1] or ".m4a"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(form["file"].file.read())
            path = tmp.name
        try:
            segments, info = model.transcribe(path, language=language, vad_filter=True, initial_prompt=PROMPT)
            text = " ".join(s.text.strip() for s in segments).strip()
            self._json(200, {"text": text, "language": info.language, "duration": info.duration})
        except Exception as e:  # fichier illisible, format inconnu
            self._json(422, {"error": f"Transcription impossible : {e}"})
        finally:
            os.unlink(path)

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[whisper] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"Transcription prête sur http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
