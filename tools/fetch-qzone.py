#!/usr/bin/env python3
"""
服务端QQ空间说说抓取脚本（标准库版，无第三方依赖）
"""
import os
import json
import base64
import time
import ssl
import urllib.request
import urllib.parse

OUTPUT_FILE = os.environ.get("OUTPUT_FILE", "qzone_shuoshuo_backup.json")
BASE_URL = "https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def load_credentials():
    b64 = os.environ.get("QZONE_CREDENTIALS_B64", "")
    raw = os.environ.get("QZONE_CREDENTIALS_RAW", "")
    if b64:
        return json.loads(base64.b64decode(b64).decode("utf-8"))
    if raw:
        return json.loads(raw)
    local = os.path.expanduser("~/.qzone_sdk/cookies.json")
    if os.path.exists(local):
        print(f"从本地读取: {local}")
        with open(local, "r", encoding="utf-8") as f:
            return json.load(f)
    raise RuntimeError("缺少 QZONE_CREDENTIALS_B64 或 QZONE_CREDENTIALS_RAW，且本地无 cookies.json")


def calc_gtk(cookie_str):
    p_skey = ""
    for part in cookie_str.split("; "):
        if part.startswith("p_skey="):
            p_skey = part.split("=", 1)[1]
            break
    if not p_skey:
        for part in cookie_str.split("; "):
            if part.startswith("skey="):
                p_skey = part.split("=", 1)[1]
                break
    h = 5381
    for ch in p_skey:
        h += (h << 5) + ord(ch)
    return h & 0x7FFFFFFF


def fetch_page(uin, cookie, g_tk, pos, num=20):
    params = {
        "uin": uin, "ftype": 0, "sort": 0, "pos": pos, "num": num,
        "replynum": 100, "format": "jsonp", "need_private_comment": 1,
        "g_tk": g_tk,
    }
    url = BASE_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Cookie": cookie,
        "User-Agent": UA,
        "Referer": f"https://user.qzone.qq.com/{uin}",
    })
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    data = urllib.request.urlopen(req, context=ctx, timeout=20).read().decode("utf-8").strip()

    # 剥离 JSONP 回调：支持 _pre(...)、_Callback(...) 等任意前缀
    if not data.startswith("{"):
        l = data.find("(")
        r = data.rfind(")")
        if l != -1 and r != -1 and r > l:
            data = data[l + 1:r]
        else:
            raise ValueError(f"无法识别的响应格式: {data[:200]}")

    return json.loads(data)


def main():
    creds = load_credentials()
    cookie = creds.get("cookies", "")
    uin = str(creds.get("uin", ""))
    if not cookie or not uin:
        raise RuntimeError("凭证缺少 cookies 或 uin")

    g_tk = calc_gtk(cookie)
    print(f"uin={uin}, g_tk={g_tk}")

    all_posts, pos, total = [], 0, None

    while True:
        json_data = None
        for attempt in range(1, 7):
            try:
                json_data = fetch_page(uin, cookie, g_tk, pos)
                break
            except KeyboardInterrupt:
                print("\n用户中断")
                raise
            except Exception as e:
                wait = 3 * attempt
                print(f"pos={pos} 第{attempt}次失败: {e}，{wait}s后重试")
                time.sleep(wait)

        if json_data is None:
            print(f"pos={pos} 重试6次仍失败，停止")
            break

        if json_data.get("subcode", 0) != 0 and json_data.get("code", 0) != 0:
            print(f"接口错误: {json_data.get('message', json_data)}")
            break

        msglist = json_data.get("msglist") or []
        if total is None:
            total = json_data.get("total", 0)
            print(f"说说总数 = {total}")

        all_posts.extend(msglist)
        print(f"已抓 {len(all_posts)}/{total}")

        pos += 20
        if not msglist or (total and len(all_posts) >= total):
            break
        time.sleep(1.5)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_posts, f, ensure_ascii=False, indent=2)
    print(f"✅ 已写入 {OUTPUT_FILE}，共 {len(all_posts)} 条")


if __name__ == "__main__":
    main()