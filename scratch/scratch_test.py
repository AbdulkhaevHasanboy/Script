import requests

BASE_URL = "https://aileaders.uz"
HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9,uz;q=0.8",
    "content-type": "application/json",
    "origin": "https://aileaders.uz",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
}

session = requests.Session()
session.get(BASE_URL, headers={"User-Agent": HEADERS["user-agent"]})

document = "AE1963347"
dob = "2007-10-28"
phone = "+"

print("Running first_api_call...")
url1 = f"{BASE_URL}/api/public/info/individual"
params1 = {"document": document, "dob": dob, "occupation": "student"}
resp1 = session.post(url1, params=params1, headers=HEADERS, data="")
print("first_api_call response status:", resp1.status_code)
print("first_api_call response text:", resp1.text)

print("Running second_api_call...")
url2 = f"{BASE_URL}/api/registration/form"
payload2 = {
    "email": "test.email@gmail.com",
    "employment_type": "student",
    "metrika": None,
    "passport": {"document": document, "dob": dob},
    "password": document,
    "phone": phone,
}
resp2 = session.post(url2, headers=HEADERS, json=payload2)
print("second_api_call response status:", resp2.status_code)
print("second_api_call response text:", resp2.text)
try:
    print("Parsed JSON:", resp2.json())
except Exception as e:
    print("JSON Parse Error:", e)
