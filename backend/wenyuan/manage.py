import argparse
import os
from pathlib import Path

from .store import Store


def main():
    parser = argparse.ArgumentParser(description="创建单机用户；生成的登录令牌只显示一次")
    parser.add_argument("command", choices=["create-user"])
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    store = Store(Path(os.environ.get("WENYUAN_DATA", ".data")))
    print(store.provision(args.name))


if __name__ == "__main__":
    main()
