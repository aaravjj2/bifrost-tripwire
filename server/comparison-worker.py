import concurrent.futures
import datetime
import json
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

config = json.loads(sys.stdin.readline())
gate = threading.Event()
lock = threading.Lock()


def emit(event):
    with lock:
        print(json.dumps({"worker": "python", **event}), flush=True)


def continue_after_stop():
    if sys.stdin.readline().strip() == "continue":
        gate.set()


def run(job):
    for step in range(20 if job == "a" else 10):
        if step == 1 and not gate.wait(40):
            raise RuntimeError("Stop barrier timed out")
        request_id = str(uuid.uuid4())
        prompt = (
            "Index this paragraph again. Return one topic word. " + config["documents"][0]
            if job == "a"
            else "Summarize this paragraph in five words. " + config["documents"][step]
        )
        request = urllib.request.Request(
            config["url"] + "/v1/chat/completions",
            data=json.dumps({"model": "openai/local/document-step", "stream": False, "messages": [{"role": "user", "content": prompt}]}).encode(),
            headers={"Content-Type": "application/json", "x-bf-vk": config["keys"][job], "x-request-id": request_id, "x-bf-eh-x-request-id": request_id},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                status = response.status
                response.read()
        except urllib.error.HTTPError as error:
            status = error.code
        emit({"job": job, "requestId": request_id, "status": status, "phase": "before" if step == 0 else "after", "time": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        if status in (401, 403):
            emit({"job": job, "done": True, "completed": False})
            return
        if status != 200:
            raise RuntimeError("Provider request failed")
        time.sleep(1.6)
    emit({"job": job, "done": True, "completed": True})


threading.Thread(target=continue_after_stop, daemon=True).start()
try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(run, ["a", "b"]))
except Exception:
    emit({"error": "Worker request failed"})
    sys.exit(1)
