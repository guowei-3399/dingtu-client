---
name: 定途连接助手
description: 柔和灰紫表面、彩色立体工具图标与底部蓝色连接操作。
colors:
  canvas-light: "#f4f4fa"
  rail-light: "#f0f0f8"
  panel-light: "#ffffff"
  layer-light: "#f5f5fa"
  ink-light: "#252536"
  muted-light: "#666679"
  subtle-light: "#6b6b7a"
  line-light: "#e9e9f2"
  accent-light: "#2172d6"
  accent-soft-light: "#e9f2ff"
  accent-ink-light: "#246ec5"
  canvas-dark: "#17171f"
  rail-dark: "#13131b"
  panel-dark: "#24242f"
  layer-dark: "#2b2b38"
  ink-dark: "#f4f3fb"
  muted-dark: "#b5b4c6"
  subtle-dark: "#aaa9bd"
  line-dark: "#333341"
  accent-dark: "#4698ff"
  accent-soft-dark: "#253b59"
  accent-ink-dark: "#9bc9ff"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    lineHeight: 1.55
  greeting:
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.25
  status-title:
    fontSize: "19px"
    fontWeight: 650
    lineHeight: 1.4
  label:
    fontSize: "12px"
rounded:
  control: "13px"
  icon: "18px"
  panel: "26px"
  secondary-panel: "24px"
spacing:
  compact: "8px"
  control: "16px"
  phone-gutter: "20px"
  panel: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  panel:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.panel}"
---
## Overview

**Creative North Star: "柔和工具台，连接后继续工作。"**

采用用户提供的《手机APP UI对标参考.png》作为当前视觉依据：柔和灰紫背景、圆形头像、大圆角浮起面板、彩色立体图标与底部中央连接动作。此规范适用于助手界面；本轮主站只增加必要同源挂载与登录回跳，不重做其后台或登录视觉。

**Key Characteristics:**
- 灰紫底色和柔和投影形成层次，蓝色承担连接与选中动作。
- 首页包含 APP 宣传 Hero、四个常用工具和选定应用行；操作后的连接状态另设紧凑反馈。
- 手机默认暗色，Windows、macOS 默认亮色，保留手动明暗切换。

## Colors

浅色以灰紫背景、白色面板和深灰文字形成层次；暗色提高面板明度，保留偏紫中性背景。主动作由此前的紫色调整为蓝色。暗色普通主按钮使用深色前景（#102039）。成功、警告、错误配合文字表达，不仅依靠颜色。

彩色渐变限定在工具图标、头像和连接图标。工具图标使用蓝、绿、橙、紫、青、粉、灰的明确色组；正文与容器不使用渐变文字或大面积渐变底。

## Typography

系统无衬线字体栈，基准 14px / 1.55，正文常用 13px，辅助与工具标签 12px。问候标题桌面 26px / 700，手机 24px；状态标题桌面 19px / 650，手机 16px；其他页面标题桌面 28px、手机 26px。IP 和接管记录使用等宽字体或表格数字，普通文案不使用终端字体。

## Layout

桌面侧栏 196px，1100px 以下为 176px。普通内容最大宽度 948px，首页最大宽度 850px；800px 以下内容最大宽度 600px，560px 以下水平内边距 20px。连接和应用已合并：首页使用真实账号问候、APP宣传Hero、应用区和唯一当前工具行。应用区默认四个常用工具，“全部应用”原位展开分类库，替换常用工具区域；不提供搜索。旧#applications入口归一至#connection并展开，刷新和历史导航保留展开状态。

宣传 Hero 使用 assets/connection-banner-v1.png（2172×724，约1.54MB），右下方块为橙陶色 Claude 放射状标志。图像不烘焙文字、alt为空，标题和副文案为HTML。桌面高232px、手机182px，深浅主题各自配置文字侧遮罩，右侧图像保持色彩。320px标题22px，避免额外折行；底部连接按钮仍为唯一连接主动作。状态反馈只在用户触发连接操作后出现，使用aria-live。

桌面已有侧栏导航，底部保留180×64px连接胶囊；800px以下为五位置浮动Dock：连接、应用、中央连接操作、出口、我的。次页页头提供返回连接首页。底栏以整个窗口中线居中，统一left:50%与translateX(-50%)，不再叠加侧栏偏移。移动Dock距底部14px加安全区，水平至少16px，本体高76px。页脚预留118px加安全区的滚动避让。详细连接路径保留在出口页折叠区域，800px以下转为纵向。

## Elevation & Depth

大圆角面板使用柔和、带垂直偏移的投影。普通面板投影由 panel-shadow 变量提供：浅色为 0 10px 30px rgba(82,78,136,.055)，暗色为 0 10px 28px rgba(0,0,0,.12)。移动 Dock 使用 0 10px 35px rgba(59,55,111,.13)，桌面胶囊为 0 10px 28px rgba(59,55,111,.1)。

应用图标使用官网或官方账号发布的原始PNG/SVG，使用统一白色外壳和内边距，不重画或给Logo套功能图标描边。来源逐项记录在assets/app-logos/SOURCE.json。非应用功能图标保留原线条系统与彩色底牌。连接图标的投影与蓝色渐变共同突出主操作。

## Shapes

普通按钮圆角 13px，面板桌面 26px、手机 24px，选定工具行手机为 23px；移动 Dock 27px，对话框 26px。头像与凸起连接操作为圆形，工具图标桌面 58×58px、圆角 18px，手机 51×51px、圆角 16px。

常用按钮和图标操作至少 44px；浮动 Dock 导航项至少 58px。小号状态标签是信息而不是点击目标。

## Components

底部蓝色连接操作负责连接、取消与断开，图标采用电源或对应状态，不以加号代替。桌面在连接胶囊内呈现，手机在完整 Dock 中央凸起。失败、到期和无备用继续保留处理动作。

首页常用工具为四列快捷选择；选定工具行单独提供接入演示、打开演示或打开方式。完整应用库只分编程、通用、任务三类；当前桌面 11 个候选，移动显示 6 个非 CLI 候选。候选存在不代表已验证安装、原生启动或网络适配。

通知入口展示当前页面真实产生的本机事件及其未读数，不冒充服务器推送。关闭提醒后仍记录诊断事件，但新事件不计未读；进入通知页标为已读。服务端绑定出口保持只读，选择工具不改变出口。“我的”显示主站返回的真实昵称、邮箱、类型、等级与验证状态；未登录、资料加载或失败与未订阅状态必须明确，不用原型角色覆盖账号。

应用分类筛选为可换行的 44px 高按钮，圆角 16px；选中项使用面板底、蓝色文字及同一面板投影。应用数量有限，不设置搜索与清空控件。工具能力以 12px 标签与 13px 内容的横向定义列表呈现，桌面间距 24px、手机 16px；云端 Agent 的入口说明不代表本机可执行能力。

备用资源行采用 24px 圆角面板，图标、说明、只读状态三列排列；桌面内边距 18px 20px、手机 17px 16px。异常提示使用语义错误底色、文字与图标，圆角 20px、正文 13px。规则与路径放入 20px 圆角折叠容器，标题点击区至少 50px。接管记录保留会话内历史，断开重连不自动回切出口。

“我的”账号面板采用相同面板材质，圆角 24px，桌面内边距 20px 22px、手机 18px 16px。“我的”分组标题复用 32px 彩色图标，不另造一套图标语言；开关变更保存在本浏览器，明确开机启动、自动连接仍需原生层执行，不声称已修改系统设置。

帮助、通知和诊断是“我的”下的次级页面，使用返回我的、标题、面板的统一层级，不增加首页内容密度。通知行以固定事件文字、演示或本机操作标记和时间区分；最多80条、仅内存。帮助步骤和FAQ可直接查看，官方入口为独立新标签链接，不要求先模拟连接。诊断仅生成本机JSON，下载和复制均有反馈；Clipboard失败时显示只读可选文本框，手机编辑字号16px。

主题、应用选择与类别按平台保存；手机未指定时默认暗色，桌面默认亮色。恢复偏好及清空事件先用独立确认对话框说明范围；只清本助手命名空间，不清主站会话。存储不可用时给出临时生效说明，不能让控件失效。浏览器前进后退与hash刷新对应白名单路由，未知hash回到首页。

按钮使用 160ms 的颜色、透明度和按压反馈，加载图标只表达连接进度。减少动态偏好下关闭动画。权限说明对话框明确为模拟授权，系统设置、连接与应用打开仍为演示。主站资料读取与退出登录是真实会话操作，应与网络演示状态分开。

## Do's and Don'ts

### Do
- Do 应用入口使用本地保存的官方原始PNG/SVG（Claude Code与Claude共用Claude官网图标），功能导航继续用线条图标。图标使用统一外壳、内边距与object-fit居中；按钮显式重置原生样式，名称保留稳定两行空间，选中角标对齐图标右上角。
- Do 让底部连接操作与所选应用打开动作各自承担明确职责。
- Do 使用简短类别筛选，避免为少量工具增加搜索负担。
- Do 按平台显示候选应用，区分主站真实账号与网络示例数据。

### Don't
- Don't 将应用图标或候选入口解释为已经验证原生支持。
- Don't 将启动、网络接通与官方账号登录混为一个状态。
- Don't 将网页原型当作已经交付的原生 VPN 客户端。

“我的”依据同源会话自动显示两种页面状态：未登录直接呈现内嵌登录/注册表单，已登录呈现账号信息与偏好；登录、退出及会话过期均原位切换，不使用登录弹窗。

## 开屏品牌动效

开屏复用主站原创毛笔字稿 assets/launch-slogan-v1.png，品牌 slogan 为“让每一次连接，都有自己的出口。”；副文案“你的 AI 工具，一触即达。”。深蓝 #101942 与蓝紫玻璃通道配图构成独立全屏品牌画面，不改变助手主题和官方应用 logo。桌面文字左侧、图片右侧渐隐衔接，手机文字居上、玻璃门廊居下；底部文案保持单行。

首次打开同一标签会话展示一次：图片 4.4s 由 scale(1.09) 缓慢推进到 1；标题 760ms 笔意揭显，副文案 440ms 入场；4s 后图片、字稿与遮罩同步用 1100ms 缓慢淡出，露出连接主页。跳过与 Escape 随时关闭，隐藏标签暂停动画与倒计时，减少动态时保留静态完整画面。字稿下载失败显示可读文字，背景失败跳过开屏。登录后“我的 / 帮助与说明 / 重播开屏”可再次播放。品牌图来自原有配图，字稿直接复制主站原件，文本另有可访问内容。
