"""Opens Hacker News in a Scalebrowser profile and prints the three top stories.

Needs the Scalebrowser app running on this Windows machine and its API token:
    set SCALEBROWSER_TOKEN=<token>        (cmd)   or   $env:SCALEBROWSER_TOKEN="<token>"   (PowerShell)
    python top_stories.py
Run it on the machine the app runs on: the browser's DevTools socket is only
reachable from there.
"""
import os

from scalebrowser import CreateProfileBody, ScalebrowserClient

sb = ScalebrowserClient(
    base_url=os.environ.get("SCALEBROWSER_BASE_URL", "http://127.0.0.1:8787"),
    token=os.environ["SCALEBROWSER_TOKEN"],
)

# The same profile every run, so it keeps its identity and its cookies.
NAME = "sdk-example"
profile = next((p for p in sb.list_profiles(q=NAME) if p.name == NAME), None) or sb.create_profile(
    CreateProfileBody(name=NAME)
)

with sb.launch(profile.id, headless=True) as page:
    page.navigate("https://news.ycombinator.com")
    titles = page.evaluate(
        "[...document.querySelectorAll('.titleline > a')].slice(0, 3).map((a) => a.textContent)"
    )
    for title in titles:
        print(title)

sb.close()
