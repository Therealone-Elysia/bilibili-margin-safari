# Safari 移植验收记录

日期：2026-11-13（Asia/Shanghai）。上游基线：`364b1b242033d11155f5502edbb2227adc318046`。Safari 扩展版本：`0.60.52.1`，界面显示版本：`0.6.52`。

## 已完成

| 检查 | 结果 |
| --- | --- |
| TypeScript 与 Safari 专用构建 | 通过 |
| 单元测试 | 43 个测试文件、357 项通过 |
| Safari 产物资源及经典脚本检查 | 2 项通过 |
| macOS 原生宿主与 `.appex` 编译 | Apple Silicon / Intel 通用二进制 |
| ZIP 解压后的代码签名完整性 | `codesign --verify --deep --strict` 通过；为本地 ad hoc 签名 |
| 系统 WebKit 解析扩展包 | 清单无错误 |
| 系统 WebKit 加载后台 | 后台加载成功、无上下文错误 |
| Safari 27.3 安装与网站权限 | 原生应用被识别；扩展已启用；已授权 B 站 |
| Safari 首页 | 推荐内容、字体、玻璃界面与足迹卡正常加载 |
| Safari 本机足迹与历史补全 | 后台正常回复；刷新后显示已补全历史；活跃计时持续增加 |
| Safari 弹窗 | 版本及开关正常呈现 |
| Safari 主题与设置 | 亮色切换生效；设置跨页面保持；测试后恢复跟随系统 |
| Safari 视频页 | 原生播放器、弹幕与控制按钮保留，视频播放至结束并进入原生连续播放流程 |
| Safari 搜索页 | 搜索内容加载，映间顶栏与换肤生效 |
| Chromium 回归 | 首页与视频页亮/暗主题检查通过；足迹界面及后台记录检查通过 |

## 修复过程中确认的问题

- 原始消息来源校验不认识 Safari 的资源 URL，新增准确 URL 校验。
- Safari 27.3 / 系统 WebKit 的扩展加载器拒绝当前压缩后台产物，报 `SyntaxError: Unexpected identifier 'local'`；相同产物能通过 Node 与独立 JavaScriptCore 解析，因此仅做语法检查无法覆盖这个故障。Safari 构建保留非压缩后台，并通过真实 WebKit 加载检查。
- Safari 构建使用非持久后台事件页；更换资源时需要独立的 Safari 版本号，避免旧资源缓存。
- 本机 macOS 的文件元数据可能导致签名工具报错，打包脚本在签名前清理生成应用的扩展属性。最终 ZIP 另行解压验证。

## 尚未验收

- Safari 18 最低版本、Intel 真机及 iOS/iPadOS。
- 所有页面和全部可选功能；私信发送、扫码授权、广告片段跳过、全部 GPU 背景未做专项实测。
- 长时间性能、Safari 重启后的真实签名免开发者模式流程。
- Developer ID 签名、公证和 App Store 分发。
- GitHub Actions 云端执行：已触发 [macOS 构建检查](https://github.com/Therealone-Elysia/bilibili-margin-safari/actions/runs/43416721352)，发布准备时仍在等待运行器。当前通过结论来自本机测试，不代表云端构建已通过。

Safari 重启会重置允许未签名扩展的设置。当前交付可用于本机测试和预发行验证，不能称为已完成 Apple 正式分发的发行版。测试时产生的浏览器数据、账号信息、观看历史与实时截图均未打包进源码或安装包。
