import argparse
import os
import sys
from pathlib import Path

from .store import Store


def main():
    parser = argparse.ArgumentParser(description="创建单机用户；生成的登录令牌只显示一次")
    parser.add_argument("command", choices=["create-user", "configure-provider"])
    parser.add_argument("--name", required=True)
    parser.add_argument("--base-url")
    parser.add_argument("--model")
    parser.add_argument("--thinking", choices=["default", "on", "off"], default="default")
    parser.add_argument(
        "--key-stdin", action="store_true", help="从标准输入读取密钥；不要把密钥写进命令参数或 shell 历史"
    )
    parser.add_argument("--clear-key", action="store_true")
    args = parser.parse_args()
    store = Store(Path(os.environ.get("WENYUAN_DATA", ".data")))
    if args.command == "create-user":
        print(store.provision(args.name))
        return
    from .ai import Provider, validate_provider_url

    if not args.base_url or not args.model:
        parser.error("configure-provider 需要 --base-url 和 --model")
    with store.connect() as db:
        if not db.execute("SELECT id FROM users WHERE id=?", (args.name,)).fetchone():
            parser.error("用户不存在")
    validate_provider_url(args.base_url)
    config = Provider(
        base_url=args.base_url,
        model=args.model,
        thinking={"default": None, "on": True, "off": False}[args.thinking],
    ).model_dump()
    key = sys.stdin.read(2001).rstrip("\r\n") if args.key_stdin else "" if args.clear_key else None
    if key is not None and len(key) > 2000:
        parser.error("密钥过长")
    store.save_provider(args.name, {**config, "api_key": key})
    print("模型配置已保存；密钥不会返回页面或打印。")


if __name__ == "__main__":
    main()
