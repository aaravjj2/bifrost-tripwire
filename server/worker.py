import concurrent.futures
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

config = json.load(sys.stdin)


def run(association):
    headers = {
        "Content-Type": "application/json",
        "x-tripwire-association": association["token"],
        "x-bifrost-vk": config["sharedKey"],
    }
    ceiling = 20 if association["job"] == "a" else 10
    for step in range(ceiling):
        prompt = (
            "Index this paragraph again. Return one topic word. " + config["documents"][0]
            if association["job"] == "a"
            else "Summarize this paragraph in five words. " + config["documents"][step]
        )
        request = urllib.request.Request(
            config["url"] + "/gateway/v1/chat/completions",
            data=json.dumps({
                "model": "local/document-step",
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            }).encode(),
            headers={**headers, "x-request-id": str(uuid.uuid4())},
        )
        try:
            with urllib.request.urlopen(request, timeout=6) as response:
                response.read()
        except urllib.error.HTTPError as error:
            if error.code == 403:
                return
            raise
        time.sleep(1.6)
    request = urllib.request.Request(
        config["url"] + "/worker/finished", data=b"", headers=headers,
    )
    with urllib.request.urlopen(request, timeout=6) as response:
        response.read()


with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    list(executor.map(run, config["assignments"]))
