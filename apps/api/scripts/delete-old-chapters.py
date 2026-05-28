"""
Run from Cloud Shell:
  cd ~/nexi/apps/api
  python3 scripts/delete-old-chapters.py
"""
import json, subprocess

def get_token():
    result = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    return result.stdout.strip()

def main():
    TOKEN = get_token()
    PROJECT = "nexigrate-prod"
    BASE = "https://firestore.googleapis.com/v1"
    HEADERS = ["Authorization: Bearer " + TOKEN]

    # 1. Delete old chapter_content docs
    print("=== CHAPTER CONTENT CLEANUP ===")
    url = BASE + "/projects/" + PROJECT + "/databases/(default)/documents/chapter_content?pageSize=200"
    result = subprocess.run(["curl", "-s", url, "-H", HEADERS[0]], capture_output=True, text=True)
    data = json.loads(result.stdout)
    docs = data.get("documents", [])

    suffixes = ["_beginner", "_intermediate", "_advanced"]
    old_docs = []
    for d in docs:
        name = d["name"]
        has_level = any(name.endswith(s) for s in suffixes)
        if not has_level:
            old_docs.append(name)

    print("Found " + str(len(old_docs)) + " old docs to delete")

    for i, doc_path in enumerate(old_docs):
        del_url = BASE + "/" + doc_path
        subprocess.run(["curl", "-s", "-X", "DELETE", del_url, "-H", HEADERS[0]], capture_output=True)
        short_name = doc_path.split("/")[-1]
        print("  " + str(i+1) + ". Deleted: " + short_name)

    print("\nChapter cleanup done! Deleted " + str(len(old_docs)) + " old docs.\n")

    # 2. Delete cached syllabi
    print("=== SYLLABI CACHE CLEANUP ===")
    url2 = BASE + "/projects/" + PROJECT + "/databases/(default)/documents/syllabi?pageSize=100"
    result2 = subprocess.run(["curl", "-s", url2, "-H", HEADERS[0]], capture_output=True, text=True)
    data2 = json.loads(result2.stdout)
    docs2 = data2.get("documents", [])

    print("Found " + str(len(docs2)) + " cached syllabi to delete")

    for doc in docs2:
        del_url = BASE + "/" + doc["name"]
        subprocess.run(["curl", "-s", "-X", "DELETE", del_url, "-H", HEADERS[0]], capture_output=True)
        short_name = doc["name"].split("/")[-1]
        print("  Deleted: " + short_name)

    print("\nSyllabi cleanup done! Deleted " + str(len(docs2)) + " docs.")
    print("\nAll done! Fresh content will generate on next user request.")

if __name__ == "__main__":
    main()
