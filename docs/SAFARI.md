# Safari 移植版（macOS）

这是 [jiuyang5354/bilibili-margin](https://github.com/jiuyang5354/bilibili-margin) 的独立 Safari 移植，不代表上游已经官方支持 Safari。基线提交：`364b1b242033d11155f5502edbb2227adc318046`，上游显示版本 0.6.52。

## 安装本地构建

要求 macOS 14 或更新版本、Safari 18 或更新版本。本轮实测环境为 Safari 27.3；最低版本仅是构建目标，尚未在 Safari 18 真机验证。当前交付是 **开发签名（ad hoc）版本**，尚未取得 Developer ID 签名和 Apple 公证。

1. 解压 `margin-safari-macos.zip`，把 `MARGIN Safari.app` 保留在固定位置（例如“应用程序”文件夹）。
2. 打开应用，点击“打开 Safari 扩展设置”。
3. 如果列表中没有扩展，在 Safari 的“设置 → 高级”启用网页开发者功能，再在“设置 → 开发者”允许未签名扩展。系统可能要求本机身份验证。
4. 在“设置 → 扩展”勾选“映间 MARGIN”。
5. 打开 B 站，点击工具栏的 MARGIN 图标，在此网站上始终允许，然后刷新。只需授权 B 站相关网站，无需授权所有网站。

应用本身不需要一直打开。不要删除或移动正在使用的应用包。Safari 重启后，“允许未签名扩展”会重置；公开 ZIP 的 ad hoc 构建可能需要重新允许。普通 Apple 账号可按下文给自己的本机安装版签名；本分支已在关闭未签名开关、退出并重开 Safari 后验证通过。公开 ZIP 本身仍不适合当作免设置的普通发行版分发。

停用：取消勾选扩展即可恢复原版。卸载应用前可以先通过映间设置导出本地数据。

## 从源码构建

需要 Node.js 22 和 macOS 的 Xcode Command Line Tools。无需为了本地编译下载完整 Xcode。

```sh
npm ci --ignore-scripts
npm run test:unit
npm run pack:safari
npm run test:safari
```

产物：

- `dist-safari/`：Safari 专用 WebExtension 资源，可用支持临时加载的 Safari 测试。
- `safari/build/MARGIN Safari.app`：原生安装应用，内嵌 `.appex`。
- `margin-safari-macos.zip`：保留应用包结构的压缩包，内含 Apple Silicon 和 Intel 通用二进制。

编译不会自动安装、修改浏览器设置、上传 GitHub 或访问您的浏览器账户。`npm run build`、`npm run pack:firefox` 仍生成原平台构建。

macOS 15.4 或更高版本可用系统 WebKit 额外检查扩展清单和后台启动：

```sh
xcrun clang -fobjc-arc -framework Cocoa -framework WebKit \
  -mmacosx-version-min=15.4 safari/native/Validate.m -o safari/build/validate
safari/build/validate 'safari/build/MARGIN Safari.app/Contents/PlugIns/MARGIN Extension.appex'
```

## 移植范围

- Safari 使用单个隔离世界内容脚本，页面模块与可选 WebGPU 代码打入同一包，避免运行时跨扩展 URL 动态模块加载。代价是首次脚本解析量增加。
- Safari 使用非持久后台事件页；后台保留非压缩格式，避免实测发现的 WebKit 扩展加载语法错误。
- 消息来源验证支持 Safari 资源 URL；仍要求同一扩展 ID，并仅接受准确匹配的弹窗 URL 或列出的 B 站 HTTPS 页面。
- 缺少 `storage.session.setAccessLevel` 时沿用会话存储默认的可信上下文隔离，并继续清理旧凭据。
- 申请 `unlimitedStorage`，避免较低的 Safari 默认存储额度影响自定义背景。
- 原生应用只负责安装说明和打开 Safari 设置，不新增原生消息桥、账户上传或文件访问接口。
- 本分支仅面向 macOS；未交付 iOS/iPadOS 包。

## GitHub 源码与构建

可以公开源码和开发版 ZIP，并保留 MIT、字体与第三方素材许可。不要把浏览器配置、登录 Cookie、钥匙串、开发证书、`.p12`、公证凭据、用户设置备份等提交到仓库。

Safari 扩展版本在上游数字版本后追加移植修订号（当前 `.1`）；每次 Safari 发布都应递增修订号，同时更新原生 `CFBundleVersion`，以避免旧资源缓存。

`.github/workflows/safari.yml` 提供手动构建及相关 PR 的 macOS 检查，并上传开发版构建产物。它不会自动公开发行或提交任何浏览器商店。

建议首先以独立 fork 或 Safari 分支发布，将 Release 标为预发行版，并写清开发签名限制。本地构建成功不等同于已通过 Apple 分发审核。UI 实测和限制见 `SAFARI-VALIDATION.md`。

## 本机开发证书签名（已通过 Safari 重启实测）

公开分发和本机开发测试使用不同证书。只有普通 Apple 账号时，可先在 Xcode 中尝试创建 Apple Development 证书，无需为了这一步直接加入付费开发者计划。免费账号和描述文件可能有期限及能力限制，不能据此承诺永久免维护。

1. 安装并打开苹果官方 Xcode，在 `Settings → Accounts` 登录自己的 Apple 账号。
2. 选择 Personal Team，在 `Manage Certificates → + → Apple Development` 创建开发证书。如果该项不可用，可新建 macOS 应用项目，在 Signing & Capabilities 中选自己的 Personal Team、启用自动签名并构建，让 Xcode 自动申请证书。登录、协议及钥匙串授权由本人完成。
3. 保留当前扩展和公开的 ad hoc ZIP，先生成独立的本机签名候选：

```sh
npm run pack:safari
npm run sign:safari:local
```

脚本只操作生成的 MARGIN 应用，将候选保存在 `safari/local-build/MARGIN Safari.app`；没有合格证书时直接失败，不会自动退回 ad hoc 签名。存在多个开发证书时，通过 `SIGN_IDENTITY` 指定目标证书的指纹。证书及私钥留在本机钥匙串中，脚本不会导出或上传它们，也不会改动浏览器设置。

退出旧版宿主应用，将候选复制到固定位置，例如 `/Applications/MARGIN Safari.app`。如果已存在同名应用，请先备份，不要直接覆盖仍在使用的副本。复制后用 `codesign --verify --deep --strict '/Applications/MARGIN Safari.app'` 检查完整性。

随后关闭 Safari 的“允许未签名扩展”，在扩展列表启用签名版，重新授予 B 站访问权限并刷新。退出并重新打开 Safari，确认它仍保持启用且 MARGIN 页面正常加载。本分支在 Safari 27.3 上已完成以上检查；没有重启整台 Mac，也没有验证证书过期后的行为。签名到期或被撤销后需重新签名，不能承诺永久免维护。

开发签名安装版只供自己的本机使用，不能代替面向其他用户的 Developer ID 签名及公证包，也不应上传到公开 Release。更换签名可能使 Safari 将其识别为另一个扩展，替换前应使用原扩展的导出功能备份个人设置和足迹；本次未迁移旧签名的本地存储。macOS 也可能要求确认新签名宿主对旧应用沙盒数据的访问；不要删除旧容器来绕过确认。扩展工作时无需保持宿主说明窗口运行。

相关依据：[Apple 免费账号与 Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account)、[Xcode 管理签名证书](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates)。本机验收结果见 `SAFARI-VALIDATION.md`，其他系统版本仍需各自验证。

## 正式签名与公证

想让其他人安装后正常长期使用，需要 Apple Developer Program 的 Developer ID Application 证书，并对应用公证；也可以经 Mac App Store 分发。详见 [Apple 分发文档](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)。

脚本支持在本机已配置证书时签名：

```sh
BUNDLE_ID=com.yourname.margin \
SIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)' \
npm run pack:safari
```

`BUNDLE_ID` 应替换为您的唯一标识。签名与公证未在当前机器验证；不能把仅设置环境变量当作正式发行完成。拥有完整 Xcode 时，也可用 Apple 的 `safari-web-extension-packager`（旧版本名为 `safari-web-extension-converter`）将 `dist-safari/` 生成为 Xcode 工程，配置自己的开发团队及所需签名/描述文件，再归档发布。

对已用 Developer ID 签名的 ZIP 使用 `xcrun notarytool submit ... --keychain-profile ... --wait`，成功后 `xcrun stapler staple 'MARGIN Safari.app'`，校验并重新压缩已装订的应用。公证登录信息仅在自己的钥匙串或 GitHub Secrets 保存。
