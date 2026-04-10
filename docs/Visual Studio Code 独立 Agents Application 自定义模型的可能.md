# Visual Studio Code 独立 Agents Application 自定义模型的可能

## 摘要

截至当前分析版本，Visual Studio Code 独立 `Agents Application` 与普通侧边栏聊天并不是同一套目标体系。独立应用中的目标下拉、会话来源与模型来源，均由 Visual Studio Code 核心内部的 `sessions providers` 机制驱动，而非扩展层公开的 `chatSessions` 或通用 `LanguageModelChatProvider` 机制驱动。因此，第三方插件当前无法仅依赖公开扩展 API，将 OpenAI-compatible 自定义模型直接接入独立 `Agents Application` 的现有目标下拉与内置目标模型链路。若未来希望实现该能力，需要上游核心架构开放新的 provider 级扩展接口，或对现有核心 provider/model 路径进行结构性修改。

## 当前结论

### 1. 独立窗口的目标下拉来自核心 `sessions providers`

独立窗口目标下拉来自：

- [sessionTypePicker.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/contrib/chat/browser/sessionTypePicker.ts)

它读取的是：

- [sessionsProvidersService.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/services/sessions/browser/sessionsProvidersService.ts)

这些 provider 是 **core workbench contribution** 注册的，不是扩展 API 注册的。

相关核心注册位置：

- 默认独立 app 里显示 `Copilot CLI / Cloud`，来自：
  [copilotChatSessions.contribution.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessions.contribution.ts)
- “本地”对应的是另一个 core provider：`Local Agent Host`，来自：
  [localAgentHost.contribution.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/contrib/localAgentHost/browser/localAgentHost.contribution.ts)

### 2. 独立应用中的“本地”不是与 `Copilot CLI / Cloud` 并存的扩展项

这里有一个关键限制：

- `chat.agentHost.enabled = true` 时，独立 app 会跳过默认的 `Copilot CLI / Cloud` provider，只启用 `Local Agent Host`。

关键代码位置：

- 设置定义：
  [chat.contribution.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/workbench/contrib/chat/browser/chat.contribution.ts#L803-L809)
- 默认 provider 被跳过的逻辑：
  [copilotChatSessions.contribution.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessions.contribution.ts)

这意味着：

- 独立 app 里“本地”不是和 `Copilot CLI / Cloud` 并存的扩展项；
- 它是 core 的另一套 provider；
- 开了以后基本是替换关系，而不是简单新增一个选项。

### 3. 独立应用现有目标的模型链路不是插件的模型链路

#### 3.1 `Copilot CLI`

`Copilot CLI` 的模型列表来自 Copilot CLI SDK 的 `getAvailableModels(authInfo)`。

关键代码位置：

- [copilotCli.ts](https://github.com/microsoft/vscode-copilot-chat/blob/9e668cb12144c701cf0f2c6b3458c00fe3da20f1/src/extension/chatSessions/copilotcli/node/copilotCli.ts#L115-L129)
- [copilotCli.ts 鉴权信息](https://github.com/microsoft/vscode-copilot-chat/blob/9e668cb12144c701cf0f2c6b3458c00fe3da20f1/src/extension/chatSessions/copilotcli/node/copilotCli.ts#L455-L479)

#### 3.2 `Cloud`

`Cloud` 的模型列表来自后台接口 `getCopilotAgentModels(...)`。

关键代码位置：

- [copilotCloudSessionsProvider.ts](https://github.com/microsoft/vscode-copilot-chat/blob/9e668cb12144c701cf0f2c6b3458c00fe3da20f1/src/extension/chatSessions/vscode-node/copilotCloudSessionsProvider.ts#L844-L940)
- [octoKitServiceImpl.ts](https://github.com/microsoft/vscode-copilot-chat/blob/9e668cb12144c701cf0f2c6b3458c00fe3da20f1/src/platform/github/common/octoKitServiceImpl.ts#L434-L459)

#### 3.3 `Local Agent Host`

本地这条 `Local Agent Host` 后端也不是走插件的扩展模型调用链。它走的是 Copilot SDK / agent-host 自己的模型体系。

关键代码位置：

- [localAgentHostSessionsProvider.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/contrib/localAgentHost/browser/localAgentHostSessionsProvider.ts)
- [agentHost design.md](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/platform/agentHost/design.md)

这里的核心句子可以概括为：

- agent-host session 的模型请求不是 VS Code 直接通过通用 `LanguageModelChat` 发的，而是 SDK 自己发的。

所以从插件层面，无法把当前的 OpenAI-compatible provider 注入到独立 app 现有的 `Copilot CLI / Cloud / Local Agent Host` 目标里。

### 4. 侧边栏旧界面与独立 Agents Application 不是同一目标体系

侧边栏旧界面的“本地 / Copilot CLI / 云 / Claude / Custom Models”那套，不等于独立 `Agents Application` 的目标体系。

用于对比的代码位置：

- 旧聊天界面的目标枚举：
  [agentSessions.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/workbench/contrib/chat/browser/agentSessions/agentSessions.ts)
- 独立应用的新建会话视图：
  [newChatViewPane.ts](https://github.com/microsoft/vscode/blob/a6e49120535ba3e92fb6f538f5bf0fb6516861ba/src/vs/sessions/contrib/chat/browser/newChatViewPane.ts)

因此，不能把旧界面里的目标显示情况，直接推断为独立 Agents Application 里的可扩展能力。

### 5. 准确结论

基于当前版本源码，可以得到如下结论：

1. 侧边栏旧界面的“本地 / Copilot CLI / 云 / Claude / Custom Models”那套，不等于独立 `Agents Application` 的目标体系。
2. 该插件目前不能仅靠扩展 API，把自定义模型加进独立 `Agents Application` 的目标下拉。
3. 想真正实现，必须修改 VS Code / Copilot Chat 的 core 代码，而不是只改插件。

## 本地插件现状

当前插件的模型接入方式仍然是标准通用模型接入方式：

- [package.json](/F:/code_python/vscode-copilot-model-provider/package.json)
- [src/extension.ts](/F:/code_python/vscode-copilot-model-provider/src/extension.ts)
- [src/provider.ts](/F:/code_python/vscode-copilot-model-provider/src/provider.ts)

它的作用范围是：

- 可以进入普通聊天视图的模型选择器；
- 可以参与通用 `LanguageModelChat` 调用链；
- 不能直接改变独立 `Agents Application` 的 core provider 目标体系。

## 后续方向

后续如果要继续观察正式版是否出现结构性变化，建议重点检查以下几个方向：

### 1. 是否开放 `ISessionsProvider` 的扩展注册能力

若未来开放类似 `registerSessionsProvider(...)` 的公开扩展 API，则第三方扩展才有机会真正进入独立 `Agents Application` 的一级目标体系。

### 2. 独立 Agents Application 是否改为消费扩展 `chatSessions`

若未来目标下拉不再只读 `ISessionsProvidersService`，而是桥接扩展 `chatSessions`，则第三方扩展可能以 session type 的形式进入独立应用。

### 3. 内置目标是否改用通用 `LanguageModelChat` 发起模型请求

若未来 `Copilot CLI`、`Local Agent Host` 或其他本地 agent 目标改为通过通用 `LanguageModelChat` 调用模型，而不是依赖 Copilot SDK 内部模型通道，那么第三方模型才有可能自然复用进独立应用。

### 4. `chat.agentHost.enabled` 正式化后是否改为并存模式

当前 `Local Agent Host` 与默认 provider 是替换关系。后续需要关注它是否变成与 `Copilot CLI / Cloud` 并存，或者是否引入新的 provider 合并策略。

## 后续版本对照清单

为了在正式版推出后快速判断是否出现可接入机会，可以按以下清单逐项核查：

1. 独立 `Agents Application` 是否仍然读取 `ISessionsProvidersService`。
2. 目标下拉是否开始读取扩展 `chatSessions`。
3. 是否出现新的 provider 级扩展 API。
4. `Copilot CLI` 是否仍从 CLI SDK 取模型。
5. `Cloud` 是否仍从 `getCopilotAgentModels(...)` 取模型。
6. `Local Agent Host` 是否仍由 `chat.agentHost.enabled` 控制。
7. `Local Agent Host` 是否仍然替换默认 provider。
8. 是否出现允许第三方模型接入内置目标模型池的正式接口。
