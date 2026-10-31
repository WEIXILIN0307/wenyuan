# 第三方依赖与许可证

由 `scripts/third_party.py` 根据锁定安装生成，完整元数据见 `third_party/dependencies.json`，
随包附带的许可证与 bundled notices 保留在 `third_party/LICENSES.txt`。这些许可不被应用的 Apache-2.0 替代。
库存包含开发依赖；不同平台的可选包以锁文件和该平台安装为准。浏览器与系统字体不在源码仓库分发。
Next 的可选 Sharp/libvips 图像优化链已排除，应用使用标准 img 元素及服务端 Pillow。
MPL-2.0 的 certifi、CC-BY-4.0 的 caniuse-lite 等保持各自许可和归属，不宣称全依赖均为 Apache。
此清单是技术来源核对，公开发行者仍须确认平台 wheel/native/bundled 内容的对应义务。

| 生态 | 依赖 | 版本 | 许可 | 来源 |
|---|---|---|---|---|
| PyPI | Pygments | 2.21.0 | BSD-2-Clause | [upstream](https://pygments.org) |
| PyPI | annotated-doc | 0.0.5 | MIT | [upstream](https://github.com/fastapi/annotated-doc) |
| PyPI | annotated-types | 0.8.0 | MIT | [upstream](https://github.com/annotated-types/annotated-types) |
| PyPI | anyio | 4.15.1 | MIT | [upstream](https://github.com/agronholm/anyio) |
| PyPI | certifi | 2026.10.23 | MPL-2.0 | [upstream](https://github.com/certifi/python-certifi) |
| PyPI | cffi | 2.1.1 | MIT-0 | [upstream](https://github.com/python-cffi/cffi) |
| PyPI | click | 8.5.0 | BSD-3-Clause | [upstream](https://github.com/pallets/click/) |
| PyPI | cryptography | 50.0.0 | Apache-2.0 OR BSD-3-Clause | [upstream](https://github.com/pyca/cryptography) |
| PyPI | defusedxml | 0.7.1 | PSFL | [upstream](https://github.com/tiran/defusedxml) |
| PyPI | fastapi | 0.138.0 | MIT | [upstream](https://github.com/fastapi/fastapi) |
| PyPI | h11 | 0.16.0 | MIT | [upstream](https://github.com/python-hyper/h11) |
| PyPI | httpcore | 1.0.9 | BSD-3-Clause | [upstream](https://www.encode.io/httpcore/) |
| PyPI | httpx | 0.28.1 | BSD-3-Clause | [upstream](https://github.com/encode/httpx) |
| PyPI | idna | 3.20 | BSD-3-Clause | [upstream](https://github.com/kjd/idna) |
| PyPI | iniconfig | 2.3.1 | MIT | [upstream](https://github.com/pytest-dev/iniconfig) |
| PyPI | markdown-it-py | 4.0.0 | License :: OSI Approved :: MIT License | [upstream](https://github.com/executablebooks/markdown-it-py) |
| PyPI | mdurl | 0.1.2 | License :: OSI Approved :: MIT License | [upstream](https://github.com/executablebooks/mdurl) |
| PyPI | packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | [upstream](https://github.com/pypa/packaging) |
| PyPI | pillow | 13.0.0 | MIT-CMU | [upstream](https://python-pillow.org) |
| PyPI | pluggy | 1.7.0 | MIT | [upstream](https://github.com/pytest-dev/pluggy) |
| PyPI | pycparser | 3.12 | BSD-3-Clause | [upstream](https://github.com/eliben/pycparser) |
| PyPI | pydantic | 2.14.2 | MIT | [upstream](https://github.com/pydantic/pydantic) |
| PyPI | pydantic_core | 2.50.2 | MIT | [upstream](https://github.com/pydantic) |
| PyPI | pytest | 9.1.1 | MIT | [upstream](https://docs.pytest.org/en/latest/) |
| PyPI | pytest-asyncio | 1.3.0 | Apache-2.0 | [upstream](https://github.com/pytest-dev/pytest-asyncio) |
| PyPI | python-multipart | 0.0.32 | Apache-2.0 | [upstream](https://github.com/Kludex/python-multipart) |
| PyPI | ruff | 0.15.8 | MIT | [upstream](https://github.com/astral-sh/ruff) |
| PyPI | starlette | 1.10.0 | BSD-3-Clause | [upstream](https://github.com/Kludex/starlette) |
| PyPI | typing-inspection | 0.4.4 | MIT | [upstream](https://github.com/pydantic/typing-inspection) |
| PyPI | typing_extensions | 4.16.0 | PSF-2.0 | [upstream](https://github.com/python/typing_extensions) |
| PyPI | uvicorn | 0.49.0 | BSD-3-Clause | [upstream](https://uvicorn.dev/) |
| npm | @esbuild/linux-x64 | 0.27.7 | MIT | [upstream](https://github.com/evanw/esbuild#readme) |
| npm | @next/env | 16.4.1 | MIT | [upstream](https://github.com/vercel/next.js#readme) |
| npm | @next/swc-linux-x64-gnu | 16.4.1 | MIT | [upstream](https://github.com/vercel/next.js#readme) |
| npm | @next/swc-linux-x64-musl | 16.4.1 | MIT | [upstream](https://github.com/vercel/next.js#readme) |
| npm | @playwright/test | 1.60.0 | Apache-2.0 | [upstream](https://playwright.dev) |
| npm | @swc/helpers | 0.5.23 | Apache-2.0 | [upstream](https://swc.rs) |
| npm | @types/node | 24.10.1 | MIT | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) |
| npm | @types/react | 19.2.3 | MIT | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) |
| npm | @types/react-dom | 19.2.3 | MIT | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) |
| npm | baseline-browser-mapping | 2.11.34 | Apache-2.0 | [upstream](https://github.com/web-platform-dx/baseline-browser-mapping#readme) |
| npm | caniuse-lite | 1.0.30001820 | CC-BY-4.0 | [upstream](https://github.com/browserslist/caniuse-lite#readme) |
| npm | client-only | 0.0.1 | MIT | [upstream](https://reactjs.org/) |
| npm | csstype | 3.2.3 | MIT | [upstream](https://github.com/frenic/csstype#readme) |
| npm | diff | 8.0.3 | BSD-3-Clause | [upstream](https://github.com/kpdecker/jsdiff#readme) |
| npm | esbuild | 0.27.7 | MIT | [upstream](https://github.com/evanw/esbuild#readme) |
| npm | get-tsconfig | 4.14.3 | MIT | [upstream](https://github.com/privatenumber/get-tsconfig#readme) |
| npm | lucide-react | 0.562.0 | ISC | [upstream](https://lucide.dev) |
| npm | nanoid | 3.3.20 | MIT | [upstream](https://github.com/ai/nanoid#readme) |
| npm | next | 16.4.1 | MIT | [upstream](https://nextjs.org) |
| npm | orderedmap | 2.1.1 | MIT | [upstream](https://github.com/marijnh/orderedmap#readme) |
| npm | picocolors | 1.1.1 | ISC | [upstream](https://github.com/alexeyraspopov/picocolors#readme) |
| npm | playwright | 1.60.0 | Apache-2.0 | [upstream](https://playwright.dev) |
| npm | playwright-core | 1.60.0 | Apache-2.0 | [upstream](https://playwright.dev) |
| npm | postcss | 8.5.23 | MIT | [upstream](https://postcss.org/) |
| npm | prettier | 3.8.1 | MIT | [upstream](https://prettier.io) |
| npm | prosemirror-commands | 1.7.1 | MIT | [upstream](https://github.com/prosemirror/prosemirror-commands#readme) |
| npm | prosemirror-history | 1.5.0 | MIT | [upstream](https://github.com/prosemirror/prosemirror-history#readme) |
| npm | prosemirror-keymap | 1.2.3 | MIT | [upstream](https://github.com/prosemirror/prosemirror-keymap#readme) |
| npm | prosemirror-model | 1.25.9 | MIT | [upstream](https://www.npmjs.com/package/prosemirror-model) |
| npm | prosemirror-schema-list | 1.5.1 | MIT | [upstream](https://github.com/prosemirror/prosemirror-schema-list#readme) |
| npm | prosemirror-state | 1.4.4 | MIT | [upstream](https://github.com/prosemirror/prosemirror-state#readme) |
| npm | prosemirror-tables | 1.8.5 | MIT | [upstream](https://github.com/ProseMirror/prosemirror-tables#readme) |
| npm | prosemirror-transform | 1.12.0 | MIT | [upstream](https://github.com/prosemirror/prosemirror-transform#readme) |
| npm | prosemirror-view | 1.42.3 | MIT | [upstream](https://www.npmjs.com/package/prosemirror-view) |
| npm | react | 19.2.7 | MIT | [upstream](https://react.dev/) |
| npm | react-dom | 19.2.7 | MIT | [upstream](https://react.dev/) |
| npm | resolve-pkg-maps | 1.0.0 | MIT | [upstream](https://github.com/privatenumber/resolve-pkg-maps#readme) |
| npm | rope-sequence | 1.3.4 | MIT | [upstream](https://github.com/marijnh/rope-sequence#readme) |
| npm | scheduler | 0.27.0 | MIT | [upstream](https://react.dev/) |
| npm | source-map-js | 1.2.2 | BSD-3-Clause | [upstream](https://github.com/7rulnik/source-map-js) |
| npm | styled-jsx | 5.1.6 | MIT | [upstream](https://github.com/vercel/styled-jsx#readme) |
| npm | tslib | 2.8.1 | 0BSD | [upstream](https://www.typescriptlang.org/) |
| npm | tsx | 4.21.0 | MIT | [upstream](https://tsx.is) |
| npm | typescript | 5.9.3 | Apache-2.0 | [upstream](https://www.typescriptlang.org/) |
| npm | undici-types | 7.16.0 | MIT | [upstream](https://undici.nodejs.org) |
| npm | w3c-keyname | 2.2.8 | MIT | [upstream](https://github.com/marijnh/w3c-keyname#readme) |
