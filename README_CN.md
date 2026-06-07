中文 ｜ [English](./README.md)

<div align="center">

# 🎯 ComfyUI-Copilot: ComfyUI 智能助手

<h4 align="center">

<div align="center">
<img src="https://img.shields.io/badge/Version-1.0.0-blue.svg" alt="版本"> 
<img src="https://img.shields.io/github/stars/AIDC-AI/ComfyUI-Copilot?color=yellow" alt="星标">
<a href="https://github.com/AIDC-AI/ComfyUI-Copilot/blob/main/assets/qrcode.png">
    <img src="https://img.shields.io/badge/微信交流群-brightgreen?logo=wechat&logoColor=white" alt="WeChat">
  </a> 
<a href="https://discord.gg/7H9dMCvuMp">
    <img src="https://img.shields.io/badge/Discord-%20%235462eb?logo=discord&logoColor=%20%23f5f5f5" alt="Discord">
  </a>           
<a href="https://x.com/Pixelle_AI" target="_blank" rel="noopener">
  <img src="https://img.shields.io/twitter/follow/Pixelle_AI?style=social" alt="Follow on X">
</a>
<a href="https://aclanthology.org/2025.acl-demo.61.pdf">
  <img src="https://img.shields.io/badge/论文-ACL2025-B31B1B?logo=arXiv&logoColor=white" alt="Paper">
</a>
<img src="https://img.shields.io/badge/python-3.10%2B-purple.svg" alt="Python">
<img src="https://img.shields.io/badge/License-MIT-green.svg" alt="许可证">

</h4>

👾 _**阿里巴巴国际数字商业集团**_ 👾


</div>


https://github.com/user-attachments/assets/17f8e822-e852-47fc-8dcb-0471526b099e



## 🌟 介绍

**ComfyUI-Copilot** 是基于 ComfyUI 框架构建的 AIGC 智能助手，致力于为文本、图像、音频等多模态内容生成提供智能支持：无论是节点推荐、工作流构建辅助、模型查询，还是参数自动优化，ComfyUI-Copilot 都能简化 AI 算法的调试与部署流程，让创作更高效、更轻松。

### 🎉 **2025.08.14 重磅更新：全面升级为工作流开发助手**

本次发布的 **ComfyUI-Copilot v2.0** 版本从“辅助工具”升级为“开发伙伴” —— 不再只是协助你开发工作流，而是能够自主完成开发任务。我们覆盖了工作流的生成、调试、改写与调参等全链路环节，旨在带来更高效的创作体验。核心新功能包括：

- 🔧 **一键 Debug**：自动检测工作流中的错误，精准定位问题并提供修复建议。

- 🔄 **工作流改写**：根据您的描述，优化当前工作流结构，修改参数、新增节点。

- 🚀 **工作流生成能力升级**：更精准地理解您的需求，生成符合要求的工作流，降低搭建门槛。

- 🧠 **智能体架构升级**：可感知您的本地ComfyUI环境，输出最优解决方案，实现个性化适配。

✨ **立即体验全新 ComfyUI-Copilot v2.0，开启更智能的创作之旅！**


<div align="center">
<img src="assets/Framework-v3.png"/>
</div>

---
<div id="tutorial-start" />
    
## 🔥 核心功能（V2.0.0）

- 1. 💎 **生成第一版工作流**：根据您的文字描述，提供符合您需求的工作流，返回3个知识库里的优质工作流和1个AI生成的工作流，您可以一键导入到ComfyUI中，开始生图。
  - 直接在输入框输入：我想要一个xxx的工作流。
<img src="assets/工作流生成.gif"/>

- 2. 💎 **工作流Debug**：自动分析工作流中的错误，帮您修复参数错误和工作流连接错误，并给出优化建议。
  - 上方返回的4个工作流里，当您选中了一个点击Accept后，会导入ComfyUI的画布中。此时您可以点击Debug按钮，开始调整错误。
  - 输入框右上角有一个Debug按钮，点击后直接对当前的画布上的工作流进行Debug。
<img src="assets/debug.gif"/>
  - 如果识别出来工作流缺失了模型，会自动提示您下载模型。
<div align="center">
<img src="assets/Debug模型下载.jpg" width="50%"/>
</div>
  - 您也可以直接点击下方的模型下载按钮，输入模型关键词，从推荐的模型里选择所需模型。
<img src="assets/模型下载.jpg"/>

- 3. 💎 **之前的工作流生图效果不满意？**：提出您不满意的地方，让我们帮您修改工作流，增加节点，修改参数，优化工作流结构。
  - 在输入框输入：帮我在当前的画布上添加一个xxxx。
  - 注意事项：如果是2025年5月往后新出的模型，例如wan2.2等模型，可能会导致LLM无法理解，进程中断。可以尝试添加专家经验，来帮助LLM更好的生成工作流。
  - 工作流改写难度高，且会携带大量上下文，需要控制上下文长度，否则容易中断，建议经常点击右上角的清空上下文按钮，控制对话长度。
<img src="assets/改写.gif"/>
<img src="assets/expert_add.jpg"/>
  
- 4. 💎 **调参过程太痛苦？**：我们为您提供了调参工具，您可以设置参数范围，系统会自动批量执行不同参数组合，并生成结果可视化对比，帮助您快速找到最优参数配置。
  - 切换Tab到GenLab，然后根据引导使用，请注意此时的工作流要能正常运行，才能批量跑图评估参数。
<img src="assets/Genlab.gif"/>

想让ComfyUI-Copilot辅助您完成工作流开发？
- 5. 💎 **节点推荐**：根据您的描述，推荐您可能需要的节点，并给出推荐理由。
  - 在输入框输入：我想要一个能完成xxx的节点。
<img src="assets/节点推荐.gif"/>

- 6. 💎 **节点查询系统**：选中画布上的节点，点击节点查询按钮，深入探索节点，查看其说明、参数定义、使用技巧和下游工作流推荐。
  - 在输入框输入：xxx节点的用处、输入和输出。
<img src="assets/节点信息查询.gif"/>

- 7. 💎 **模型推荐**：根据您的需求，为您查找基础模型和 'lora'。
  - 在输入框输入：我想要一个生成xxx图片的Lora。

![模型推荐1](https://github.com/user-attachments/assets/3e8a3c8d-df3f-4877-a54e-d62529fe26c4)


- 8. 💎 **下游节点推荐**：在您选中了画布上的某个节点后，根据您画布上已有的节点，推荐您可能需要的下游子图。
<img src="assets/下游节点推荐.gif"/>

---

## 🚀 快速开始

**仓库概览**：访问 [GitHub 仓库](https://github.com/AIDC-AI/ComfyUI-Copilot) 以获取完整代码库。

#### 安装
  1. 首先，用git把ComfyUI-Copilot安装到ComfyUI的custom_nodes目录下：

   ```bash
   cd ComfyUI/custom_nodes
   git clone git@github.com:AIDC-AI/ComfyUI-Copilot.git
   ```
   
   或
   
   ```bash
   cd ComfyUI/custom_nodes
   git clone https://github.com/AIDC-AI/ComfyUI-Copilot
   ```

   然后，在ComfyUI的custom_nodes目录下，找到ComfyUI-Copilot目录，安装ComfyUI-Copilot的依赖

   ```bash
   cd ComfyUI/custom_nodes/ComfyUI-Copilot
   pip install -r requirements.txt
   ```
   如果您是windows用户：

   ```bash
   python_embeded\python.exe -m pip install -r ComfyUI\custom_nodes\ComfyUI-Copilot\requirements.txt
   ```
   

  2. **使用 ComfyUI 管理器**：打开 ComfyUI 管理器，点击自定义节点管理器，搜索 ComfyUI-Copilot，并点击安装按钮。注意：请点击update按钮更新到最新版本的ComfyUI-Copilot。
     - Manager需要权限，为了防止执行的过程中报错，建议运行的时候使用 sudo python main.py。
     - 如果你遇到update的时候报错，此时需要你删掉这个文件夹或者点击uninstall，再重新install一次。
     - 如果执行报错，建议打开右上角的底部面板按钮，触发Manager安装ComfyUI-Copilot，此时下方会出现报错日志，截图并贴到git issue里，我们会尽快跟进。
     - 使用Manager安装容易遇到bug，建议使用上方的git安装方式
   <img src="assets/comfyui_manager.png"/>
   <img src="assets/comfyui_manager_install.png"/>


#### **激活**
在运行 ComfyUI 项目后，在面板左侧找到 Copilot 激活按钮以启动其服务。
<img src="assets/start.jpg"/>

#### **API Key 生成**
点击*按钮，在弹窗里输入您的电子邮件地址，API Key 将稍后自动发送到您的电子邮件地址。收到API Key后，将API Key粘贴到输入框中，点击保存按钮，即可激活Copilot。
<img src="assets/keygen.png"/>

#### **配置您自己的openAI模型**
点击*按钮，配置对话模型以及工作流生成模型。
<div align="center">
    <img  width="50%" alt="image" src="https://github.com/user-attachments/assets/3411f48f-d597-4ad1-b45f-9819ecec2fa7" />
</div>

#### **使用 MiniMax 作为 LLM 提供商**
[MiniMax](https://www.minimaxi.com/) 提供 OpenAI 兼容的 API，支持高性能模型（MiniMax-M3，512K 上下文窗口，最大输出 128K，以及 MiniMax-M2.7 和 MiniMax-M2.7-highspeed）。

**方式一 — 环境变量**（推荐，适用于固定配置）：
```bash
export MINIMAX_API_KEY="your-minimax-api-key"
# 然后照常启动 ComfyUI
```

**方式二 — UI 配置**：
1. 点击 ComfyUI-Copilot 的设置按钮
2. 将 **Base URL** 设置为 `https://api.minimax.io/v1`
3. 输入 MiniMax API Key
4. 从下拉菜单中选择 MiniMax 模型


#### **注意**：
本项目持续更新中，请更新到最新代码以获取新功能。您可以使用 git pull 获取最新代码，或在 ComfyUI Manager 插件中点击“更新”。
我们的项目依赖于一些外部接口，服务部署在新加坡，可能需要您使用科学上网工具哦。

---
<div id="tutorial-end" />

## 🤝 贡献

我们欢迎任何形式的贡献！可以随时提出 Issues、提交 Pull Request 或建议新功能。


## 📞 联系我们

如有任何疑问或建议，请随时联系：ComfyUI-Copilot@service.alibaba.com。

Discord 社群：
<div align="center">
<img width="20%" alt="image" src="https://github.com/user-attachments/assets/3f06ab60-5799-47ea-af7e-21f4e6671ad3" />

  Discord: https://discord.gg/rb36gWG9Se
</div>

微信服务群：
<div align="center">
<img src='https://github.com/AIDC-AI/ComfyUI-Copilot/blob/main/assets/qrcode.png' width='20%'>
</div>

## 📚 许可证

该项目采用 MIT 许可证 - 有关详情，请参阅 [LICENSE](https://opensource.org/licenses/MIT) 文件。

## ⭐ 星标历史

[![星标历史图](https://api.star-history.com/svg?repos=AIDC-AI/ComfyUI-Copilot&type=Date)](https://star-history.com/#AIDC-AI/ComfyUI-Copilot&Date)
