"""Rebuild dependency metadata and retain shipped notices from installed locked packages.

Run with backend/.venv/bin/python. This is an inventory, not a legal opinion.
"""

import argparse
import json
import subprocess
import sysconfig
from importlib.metadata import distributions
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def license_file(path):
    name = path.name.lower()
    return (
        path.is_file()
        and any(word in name for word in ("license", "licence", "copying", "notice"))
        and path.suffix.lower() not in {".py", ".pyc", ".js", ".map", ".so"}
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--store-dir", help="Only needed if installation used a custom pnpm store")
    args = parser.parse_args()
    command = [
        "pnpm",
        *([f"--config.store-dir={args.store_dir}"] if args.store_dir else []),
        "licenses",
        "list",
        "--json",
    ]
    npm = json.loads(subprocess.check_output(command, cwd=ROOT / "frontend"))
    rows, texts = [], []
    for license_name, packages in sorted(npm.items()):
        for package in packages:
            rows.append(
                {
                    "ecosystem": "npm",
                    "name": package["name"],
                    "versions": package["versions"],
                    "license": license_name,
                    "source": package.get("homepage") or f"https://www.npmjs.com/package/{package['name']}",
                    "author": package.get("author", "未列出，见上游 notices"),
                }
            )
            for directory in package["paths"]:
                directory = Path(directory)
                for file in sorted(directory.rglob("*")):
                    if license_file(file) and file.stat().st_size < 1_000_000:
                        texts.append(
                            f"\n\n===== npm {package['name']} {'/'.join(package['versions'])} / {file.relative_to(directory)} =====\n"
                            + file.read_text(errors="replace")
                        )
    # Explicit path prevents inherited PYTHONPATH from including unrelated system packages.
    for dist in sorted(
        distributions(path=[sysconfig.get_path("purelib")]), key=lambda d: d.metadata["Name"].lower()
    ):
        md = dist.metadata
        license_name = md.get("License-Expression") or md.get("License")
        if not license_name:
            classifiers = [v for v in md.get_all("Classifier", []) if v.startswith("License ::")]
            license_name = "; ".join(classifiers) or "待人工核对"
        urls = md.get_all("Project-URL", [])
        source = next(
            (
                v.split(",", 1)[1].strip()
                for v in urls
                if any(k in v.lower().split(",")[0] for k in ("source", "home", "repo"))
            ),
            md.get("Home-page") or f"https://pypi.org/project/{md['Name']}/{dist.version}/",
        )
        rows.append(
            {
                "ecosystem": "PyPI",
                "name": md["Name"],
                "versions": [dist.version],
                "license": license_name,
                "source": source,
                "author": md.get("Author") or md.get("Author-email") or "见上游 notices",
            }
        )
        for relative in sorted(dist.files or []):
            file = Path(dist.locate_file(relative))
            if license_file(file) and file.stat().st_size < 1_000_000:
                texts.append(
                    f"\n\n===== PyPI {md['Name']} {dist.version} / {relative} =====\n"
                    + file.read_text(errors="replace")
                )
    output = ROOT / "third_party"
    output.mkdir(exist_ok=True)
    (output / "dependencies.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    (output / "LICENSES.txt").write_text(
        "Installed package license/notice texts, including bundled notices where shipped.\n" + "".join(texts)
    )
    table = [
        "# 第三方依赖与许可证",
        "",
        "由 `scripts/third_party.py` 根据锁定安装生成，完整元数据见 `third_party/dependencies.json`，",
        "随包附带的许可证与 bundled notices 保留在 `third_party/LICENSES.txt`。这些许可不被应用的 Apache-2.0 替代。",
        "库存包含开发依赖；不同平台的可选包以锁文件和该平台安装为准。浏览器与系统字体不在源码仓库分发。",
        "Next 的可选 Sharp/libvips 图像优化链已排除，应用使用标准 img 元素及服务端 Pillow。",
        "MPL-2.0 的 certifi、CC-BY-4.0 的 caniuse-lite 等保持各自许可和归属，不宣称全依赖均为 Apache。",
        "此清单是技术来源核对，公开发行者仍须确认平台 wheel/native/bundled 内容的对应义务。",
        "",
        "| 生态 | 依赖 | 版本 | 许可 | 来源 |",
        "|---|---|---|---|---|",
    ]
    for row in sorted(rows, key=lambda r: (r["ecosystem"], r["name"])):
        license_name = row["license"].replace("|", "\\|").replace("\n", " ")
        table.append(
            f"| {row['ecosystem']} | {row['name']} | {', '.join(row['versions'])} | {license_name} | [upstream]({row['source']}) |"
        )
    (ROOT / "THIRD_PARTY_NOTICES.md").write_text("\n".join(table) + "\n")
    print(f"Recorded {len(rows)} installed dependencies and {len(texts)} shipped license/notice files")


if __name__ == "__main__":
    main()
