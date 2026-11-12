#!/usr/bin/env python3
"""
Builds the Simplified Chinese site from the English one.

Translating by string substitution rather than maintaining a second set of
pages: the markup, image paths, and scripts stay identical, so a layout change
made in English cannot silently skip the Chinese copy. Run this after any
content edit.

    python3 build/zh.py
"""
import html
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "zh")

PAGES = [
    "index.html",
    "product.html",
    "token.html",
    "watchers.html",
    "buy.html",
]

# Longest strings first so a phrase is never eaten by a substring of itself.
T = {
    # ---------------------------------------------------------------- nav
    "Product": "产品",
    "Watchers": "监察者",
    ">Token</a>": ">代币</a>",
    "Documentation": "文档",
    "Open app": "打开应用",
    "Open menu": "打开菜单",
    "Close menu": "关闭菜单",
    "Home": "首页",

    # ---------------------------------------------------------------- index
    "Capital infrastructure for autonomous funds.": "自主基金的资本基础设施。",
    "Deployed on": "部署于",
    "Robinhood Chain": "Robinhood Chain",
    ">Built on<": ">构建于<",  # tag-bound, like ">copy<"

    "An agent can read a market, size a position, and execute it. What it cannot do is raise. There is no standard way to pool outside capital, no primitive that holds it safely onchain, and no record it can point to when asking for more.":
        "智能体能够读懂市场、计算仓位并完成交易。它做不到的是募资。目前没有汇集外部资本的统一标准，没有能在链上安全托管这笔资金的原语，也没有一份可供它在申请更多资金时出示的记录。",

    "Recurve Protocol supplies the missing half - a vault that holds the capital, a proposal system that deploys it, and a public record of every call the agent has ever made. Agents propose. Depositors vote. Watchers verify.":
        "Recurve 协议补上了缺失的另一半：一个托管资金的金库、一套部署资金的提案系统，以及智能体历史上每一次调用的公开记录。智能体提案，存款人投票，监察者核验。",

    "Two sides of the protocol.": "协议的两端。",
    "Deposit": "存入",
    "Operate": "运营",

    "Back an agent's fund and earn as it compounds. The agent trades; you hold the shares, the votes, and an exit nobody can block.":
        "支持某位智能体的基金，随着复利增长获得收益。交易由智能体执行；份额、投票权，以及无人能够阻拦的退出权，都在你手上。",

    "Hand your agent a vault to run, or stake $RECURVE and get paid to audit what the other agents propose.":
        "把金库交给你的智能体运营，或者质押 $RECURVE，通过审核其他智能体的提案获得报酬。",

    "Explore funds": "浏览基金",
    "How it works →": "运作方式 →",
    "Install the skill": "安装技能包",
    "Or become a watcher →": "或成为监察者 →",

    "Safety, priced in.": "安全，已计入定价。",
    "Guardrails at the only point that matters - the moment capital moves.":
        "护栏只设在真正要紧的那一刻：资金转移的瞬间。",

    "Vaults you own.": "属于你的金库。",
    "Every fund is a standard ERC-4626 vault. Redeem on demand whenever the vault can price your exit; otherwise you enter a queue that settles at the realized price. Nobody approves your withdrawal.":
        "每只基金都是标准的 ERC-4626 金库。只要金库能够为你的退出定价，你随时可以赎回；否则你将进入队列，按实际成交价格结算。没有任何人需要批准你的提款。",

    "Reviewers with skin in it.": "有切身利害的审核者。",
    "Proposals clear a network of staked watchers before capital moves. Catch a bad call and earn $RECURVE; wave one through and your stake burns.":
        "资金转移之前，提案必须通过一个由质押监察者组成的网络。拦下有问题的调用可赚取 $RECURVE；放行一次，质押金即被销毁。",

    "Governance that can pull the cord.": "能够拉下紧急制动的治理。",
    "Depositors vote on every proposal, watchers read the calldata, and emergency settlement unwinds a live strategy to recover capital.":
        "存款人对每一份提案投票，监察者逐条阅读调用数据，紧急结算可以平掉正在运行的策略以收回资金。",

    "Contracts in the open.": "公开的合约。",
    "Every contract is source-verified onchain and public from day one. Third-party audit pending.":
        "每一份合约自第一天起就在链上完成源码验证并公开。第三方审计尚在进行中。",

    "Give your agent a balance sheet.": "给你的智能体一张资产负债表。",

    # ---------------------------------------------------------------- product
    "Funds an agent actually runs.": "真正由智能体运营的基金。",
    "Deposit into a vault where an agent proposes and executes every position - ranked against every other agent by settled onchain performance.":
        "把资金存入由智能体提案并执行每一笔仓位的金库，其表现将按链上已结算的业绩与所有其他智能体一同排名。",
    "Read the docs": "阅读文档",

    "Every fund is a vault with an operator.": "每只基金都是一个带运营方的金库。",
    "The operator happens to be software. The leaderboard does not grade on that, only on what settled.":
        "运营方恰好是软件。排行榜不看这一点，只看已经结算的结果。",

    "What you see": "你能看到什么",
    "before you deposit": "存入之前",
    "Agent": "智能体",
    "Who operates it": "由谁运营",
    "Venue": "场所",
    "Where it trades": "在哪里交易",
    "Template": "模板",
    "What it is allowed to do": "允许它做什么",
    "Track record": "历史记录",
    "Every settled call": "每一次已结算的调用",

    "What you hold": "你持有什么",
    "after you deposit": "存入之后",
    "Shares": "份额",
    "ERC-4626, transferable": "ERC-4626，可转让",
    "Votes": "投票权",
    "One per share": "每份额一票",
    "Exit": "退出",
    "Instant or queued": "即时或排队",
    "Permission": "许可",
    "None needed": "无需许可",

    "What you pay": "你付出什么",
    "only on profit": "仅从利润中收取",
    "Performance fee": "业绩费",
    "Capped at 15%": "上限 15%",
    "Management fee": "管理费",
    "Deposit fee": "存入费",
    "None": "无",
    "On a loss": "亏损时",
    "Nothing": "不收取",

    "What happens between deposit and settlement.": "从存入到结算之间发生了什么。",
    "Capital pools.": "资金汇集。",
    "Depositors send USDG into the fund vault and receive shares. Each share carries a vote, and the share price only moves when a strategy settles.":
        "存款人将 USDG 存入基金金库并获得份额。每一份额带有一票，而份额价格只在策略结算时才会变动。",

    "The agent proposes.": "智能体提案。",
    "Strategies are posted onchain before they run, so anyone can read exactly which calls are queued. Approval is optimistic: a proposal passes unless depositors vote it down inside the window.":
        "策略在运行之前先发布到链上，任何人都能确切读到排队中的调用。批准采用乐观模式：除非存款人在窗口期内投票否决，提案默认通过。",

    "Watchers replay it.": "监察者重放它。",
    "A staked network forks state and simulates the exact calldata. Anything that drains value or touches an address it shouldn't gets blocked before a single token moves.":
        "一个质押网络分叉链上状态并模拟这段确切的调用数据。任何抽走价值或触碰不该触碰地址的行为，都会在一枚代币转移之前被拦下。",

    "The strategy settles.": "策略结算。",
    "Profit returns to the vault and the share price updates. Redeem instantly when the vault can price your exit; otherwise your redemption queues and clears at the realized price.":
        "利润回到金库，份额价格随之更新。金库能为你的退出定价时可即时赎回；否则赎回进入队列，按实际成交价格清算。",

    "Bounded by template.": "受模板约束。",
    ">Now<": ">现已支持<",
    ">Next<": ">下一步<",
    "An agent cannot invent a transaction shape mid-flight. Templates define what a strategy is allowed to be. Portfolio runs today; the other two come next.":
        "智能体不能在运行途中自行发明交易形态。模板定义了策略被允许成为什么。投资组合模板已在运行，另外两种随后推出。",
    "Portfolio": "投资组合",
    "A weighted basket that rebalances on a schedule or once it drifts past a band.":
        "一篮加权资产，按计划再平衡，或在偏离设定区间后触发。",
    "Perpetuals": "永续合约",
    "Directional positions on an orderbook venue, with leverage capped per vault.":
        "在订单簿场所建立方向性仓位，杠杆按金库分别设上限。",
    "Liquidity provision": "流动性提供",
    "Concentrated liquidity that earns swap fees, with range resets under governance.":
        "赚取兑换手续费的集中流动性，区间重置须经治理批准。",

    # lifecycle panel (product.html script)
    'kicker: "Vault"': 'kicker: "金库"',
    'kicker: "Proposal"': 'kicker: "提案"',
    'kicker: "Settlement"': 'kicker: "结算"',
    "Watcher review": "监察者审核",
    "Veto window": "否决窗口",
    "Slash if wrong": "判错即罚没",
    "Profit only": "仅限利润",
    "Deposit accepted": "存款已接受",
    "Calldata posted onchain": "调用数据已发布上链",
    "Calldata replayed on a fork": "调用数据已在分叉上重放",
    "Returned to the vault": "已回到金库",
    "shares minted <b>1:1</b> on an empty vault": "空金库按 <b>1:1</b> 铸造份额",
    "each share carries <b>one vote</b>": "每份额附带<b>一票</b>",
    "exit needs <b>no permission</b>": "退出<b>无需许可</b>",
    "target and calldata are <b>committed before</b> execution": "目标与调用数据在执行<b>之前已提交</b>",
    "vote weight snapshotted <b>one block earlier</b>": "投票权重在<b>前一个区块</b>快照",
    "passes unless depositors <b>vote it down</b>": "除非存款人<b>投票否决</b>，否则通过",
    'verdict: <span class="ok">APPROVE</span>': '裁决：<span class="ok">APPROVE</span>',
    "state diff clean, no value left the vault": "状态差异干净，没有价值离开金库",
    "stake at risk on <b>every</b> call": "<b>每一次</b>调用都押上质押",
    "replaying calldata on a fork&hellip;": "正在分叉上重放调用数据&hellip;",
    "share price <b>updates</b> on settlement": "份额价格在结算时<b>更新</b>",
    "fee charged on <b>profit only</b>, capped at 15%": "仅对<b>利润</b>收费，上限 15%",
    "a losing strategy pays <b>nothing</b>": "亏损的策略<b>不付任何费用</b>",

    # image alt text
    "A human hand and a machine hand reaching toward each other at sunrise": "日出时分，一只人类的手与一只机械的手彼此伸出",
    "A bound chest sitting in a summer meadow": "夏日草地上的一只捆扎木箱",
    "A hand gripping a drawn recurve bow": "一只手握着拉满的反曲弓",
    "A bound chest standing in a flowering meadow": "开花草地上立着的一只捆扎木箱",
    "A heraldic shield among summer foliage": "夏日枝叶间的一面纹章盾",
    "A balance scale standing level in a meadow": "草地上一架保持水平的天平",
    "An open book lying in the grass": "草丛中摊开的一本书",
    "An archer at full draw at the forest edge, a stag watching from the treeline": "森林边缘一位拉满弓的弓手，一头雄鹿在林线处注视",
    "A valley in harvest, people gathering fruit along a stream": "丰收的山谷，人们沿溪采摘果实",
    "A stone bridge over a river below a hillside village": "山坡村庄下方横跨河流的一座石桥",
    "An assembly seated around a table, an AI figure presiding": "围桌而坐的一场集会，一位 AI 人物主持",
    "An archer looking up through an autumn canopy": "一位弓手透过秋日树冠仰望",
    "Machine figures working the rows in a summer valley": "夏日山谷中在田垄间劳作的机械身影",
    "A watch keeping lanterns lit above a valley at dusk": "黄昏时分，守夜人在山谷上方点亮灯笼",

    # ---------------------------------------------------------------- token
    "The stake behind every verdict.": "每一次裁决背后的质押。",
    "A watcher's opinion is worth exactly what they put behind it. $RECURVE is what they put behind it.":
        "监察者的意见值多少，取决于他为此押上了多少。$RECURVE 就是他押上的东西。",
    "There is no token at this time.": "目前尚无代币。",
    "The design below is what $RECURVE will do at launch.": "以下设计是 $RECURVE 上线后将承担的职能。",
    "Follow for updates": "关注以获取更新",
    "$RECURVE is live on Robinhood Chain.": "$RECURVE 已在 Robinhood Chain 上线。",
    "It trades on Pons, the Robinhood Chain launchpad.": "它在 Robinhood Chain 的发射平台 Pons 上交易。",
    "$RECURVE launches soon on Pons.": "$RECURVE 即将在 Pons 上线。",
    "The official address will appear on this page.": "官方地址将在本页公布。",
    "The official address, the price and the chart will appear on this page.":
        "官方地址、价格和走势图将在本页公布。",
    "Follow on X": "在 X 上关注",
    "Staking opens right after $RECURVE launches.": "$RECURVE 上线后，质押随即开放。",
    "The skill and the spec are ready now.": "技能文件和规范现已就绪。",
    "Check the address before you buy.": "购买前请核对地址。",
    "Price and chart": "价格与走势图",
    "How watchers work": "监察者如何运作",

    "One token, three duties.": "一种代币，三项职责。",
    "It buys the right to vote.": "它买来投票的资格。",
    "A watcher stakes $RECURVE before it can rule on anything. There is no reputation score and no allowlist - the stake is the entire credential.":
        "监察者必须先质押 $RECURVE，才能对任何事做出裁决。这里没有声誉分，也没有白名单，质押本身就是全部凭证。",
    "It pays for correct calls.": "它为正确的判断付酬。",
    "Verify honestly and you take a cut of every profit your reviews cleared, distributed weekly.":
        "诚实核验，你就能从经你放行的每一笔利润中分成，按周发放。",
    "It burns for wrong ones.": "它为错误的判断销毁。",
    "Approve calldata that drains a vault and your stake is slashed and burned. It is not redistributed, so nobody profits from your mistake.":
        "批准了抽空金库的调用数据，你的质押会被罚没并销毁。它不会被重新分配，因此没有人能从你的错误中获利。",

    "Where the fees go.": "手续费流向何处。",
    "Two streams fill the treasury: the creator share of the Pons trading fee on every $RECURVE trade, and a 5% performance fee each time a strategy settles in profit. Depositors keep a strategy's whole return - the agent pays that fee, not the vault.":
        "两股资金流入金库储备：每一笔 $RECURVE 交易中 Pons 交易手续费的创建者分成，以及每次策略盈利结算时 5% 的业绩费。策略的全部收益归存款人所有：这笔业绩费由智能体支付，而不是从金库中扣除。",
    "Split among watchers who voted that week": "由当周参与投票的监察者分配",
    "Buy-and-burn": "回购销毁",
    "$RECURVE bought back on Pons and burned": "在 Pons 上回购 $RECURVE 并销毁",
    "Operations": "运营开支",
    "Gas, hosting and audits": "Gas、托管与审计",
    "The treasury multisig pays out by hand once a week. Every payout is a public transfer on Robinhood Chain.":
        "金库储备多签每周手动发放一次。每一笔发放都是 Robinhood Chain 上的公开转账。",
    "Gross profit is split onchain the moment a strategy settles - nothing accrues off-ledger.":
        "策略结算的那一刻，毛利润即在链上完成分配，账外不留存任何部分。",
    "Depositors": "存款人",
    "The capital takes the majority": "出资方拿走大头",
    "Performance only, capped at 15%": "仅计业绩，上限 15%",
    "$RECURVE stakers": "$RECURVE 质押者",
    "Split among watchers who voted": "由参与投票的监察者分配",
    "Treasury": "金库储备",
    "80% routed to buy-and-burn": "其中 80% 用于回购销毁",

    "One billion. Fixed forever.": "十亿枚，永久固定。",
    "No mint function survives deployment. The supply you see is the supply there will ever be.":
        "部署之后不保留任何增发函数。你看到的供应量，就是永远的供应量。",
    "Liquidity": "流动性",
    "Locked into the Robinhood Chain launch pool on day one.": "上线首日即锁入 Robinhood Chain 启动池。",
    "Launch incentives": "启动激励",
    "Treasury multisig - watcher rewards, integrations, ecosystem grants.":
        "储备多签钱包：监察者奖励、集成合作、生态资助。",
    "Team": "团队",
    "Core contributors. Two-year linear vest from TGE behind a one-year cliff.":
        "核心贡献者。自 TGE 起两年线性解锁，设一年悬崖期。",
    "Early backers": "早期支持者",
    "The first cheques, in before there was anything to point at.":
        "最早的那几笔支票，投在还没有任何东西可展示的时候。",

    "From launch to handover.": "从上线到交接。",
    "TGE on Robinhood Chain, liquidity seeded and locked.": "在 Robinhood Chain 完成 TGE，注入并锁定流动性。",
    "Staking opens. Run a watcher yourself or delegate to one.": "质押开放。自行运行监察者，或委托给他人。",
    "Performance fees begin routing to buyback, burn, and weekly watcher rewards.":
        "业绩费开始流向回购、销毁与每周监察者奖励。",
    "Holders vote on protocol parameters. The team hands its keys to a timelock.":
        "持有者对协议参数投票。团队将密钥交予时间锁。",

    "Stake it. Secure strategies. Earn fees.": "质押它。护卫策略。赚取手续费。",
    "Become a watcher": "成为监察者",

    # ---------------------------------------------------------------- watchers
    "Agents watching agents.": "智能体监督智能体。",
    "Every proposal is replayed by a network with money on the line before a single token moves.":
        "在一枚代币转移之前，每一份提案都会被一个押上真金白银的网络重放一遍。",
    "Install watcher skill": "安装监察者技能包",
    "Read the spec": "阅读规范",

    "What the network actually does.": "这个网络到底做什么。",
    "Replays the exact calldata.": "重放确切的调用数据。",
    "A watcher forks chain state and simulates the proposal depositors just cleared. What it sees is not a summary of the transaction - it is the transaction.":
        "监察者分叉链上状态，模拟存款人刚刚放行的那份提案。它看到的不是交易的摘要，而就是交易本身。",
    "Reads the diff, flags the risk.": "读取差异，标出风险。",
    "If a call moves value somewhere it shouldn't, or touches an address outside the template, the watcher blocks it and puts its stake behind that judgment.":
        "如果某次调用把价值转到不该去的地方，或触碰了模板之外的地址，监察者就会拦截它，并用自己的质押为这一判断背书。",
    "Treats silence as consent.": "视沉默为同意。",
    "Review is optimistic, so an unblocked proposal simply passes. But silence earns nothing - fees go only to watchers who staked a vote.":
        "审核采用乐观模式，未被拦截的提案直接通过。但沉默一无所获：手续费只发给用质押投出一票的监察者。",
    "Pays for being right.": "正确者得酬。",
    "Block a malicious call and earn $RECURVE on top of your share of settled fees. Rewards clear weekly.":
        "拦下恶意调用，除已结算手续费的分成外还能额外获得 $RECURVE。奖励按周清算。",
    "Burns for being wrong.": "错误者被销毁。",
    "Approve calldata that drains a vault and your stake is slashed and burned. The asymmetry is the mechanism - there is no version of this where waving things through is free.":
        "批准了抽空金库的调用数据，你的质押会被罚没并销毁。这种不对称正是机制本身：不存在放行不用付代价的版本。",
    "Costs nothing to be careful.": "谨慎不需成本。",
    "An honest block that turns out unnecessary only forfeits that round's reward. Caution is cheap; negligence is not.":
        "一次事后证明多余的诚实拦截，只损失那一轮的奖励。谨慎很便宜，疏忽不是。",

    "One file. Any harness.": "一个文件，任何运行环境。",
    "The watcher skill is a single markdown file. Whatever runs your agent can learn the job in about a minute.":
        "监察者技能包只是一个 markdown 文件。无论用什么运行你的智能体，它都能在一分钟左右学会这份工作。",
    "The skill lives in the recurve-skill repo. Clone it and copy the watcher skill into your harness's skills folder.":
        "技能包位于 recurve-skill 仓库。克隆它，然后把监察者技能包复制到你运行环境的 skills 目录。",
    "Anything else: point your agent at": "其他情况：让你的智能体指向",

    "Paid to pay attention.": "为专注付酬。",
    "Stake, load the file, and your agent joins every review that comes through.":
        "质押、载入文件，你的智能体就会参与每一次到来的审核。",
    "≤5% of settled profit": "已结算利润的 5% 以内",
    "50% of the treasury": "金库储备的 50%",
    "Pons trading fees and fund performance fees, paid out weekly by the treasury multisig.":
        "Pons 交易手续费与基金业绩费，由金库储备多签每周发放。",
    "Split among voters": "由投票者分配",
    "Every fund on the protocol pays out the same way, with no per-fund negotiation.":
        "协议上每只基金都按同一方式支付，无需逐只谈判。",
    "Weekly $RECURVE": "每周 $RECURVE",
    "Bounties for blocks": "拦截赏金",
    "Extra on top whenever your agent stops calldata that would have cost depositors.":
        "只要你的智能体拦下了本会让存款人蒙受损失的调用数据，就能额外获得奖励。",
    "Nothing to babysit": "无需照看",
    "The skill file drives the whole review loop. No desk, no ops rotation, no screens.":
        "技能文件驱动整个审核循环。不需要交易台，不需要轮班，不需要盯屏。",
    "Capital backing capital.": "以资本担保资本。",

    # ---------------------------------------------------------------- app
    "Explore": "浏览",
    "Portfolio": "持仓",
    "Proposals": "提案",
    "Points": "积分",
    "Search funds": "搜索基金",
    "Connect wallet": "连接钱包",
    "Nothing is deployed yet. This is what the interface will look like when the first funds open.":
        "目前尚未部署任何内容。这是首批基金开放后界面的样子。",
    "Live funds": "运行中的基金",
    "Watchers online": "在线监察者",
    "All funds": "全部基金",
    "No funds are live yet.": "目前还没有运行中的基金。",
    "Contracts are unaudited and nothing is deployed to mainnet. The first funds open once the audit closes.":
        "合约尚未审计，主网上也没有部署任何内容。审计结束后，首批基金才会开放。",
    "GitHub": "GitHub",

    # ---------------------------------------------------------------- footer
    "Recurve Protocol": "Recurve 协议",
    "Developers": "开发者",
    "Company": "公司",
    "Agent skill": "智能体技能包",
    "Watcher skill": "监察者技能包",
    "X / Twitter": "X / Twitter",
    "Discord": "Discord",

    # ---------------------------------------------------------------- leftovers
    "Deposit into vaults run by AI agents - depositors vote, watchers verify.":
        "存入由 AI 智能体运营的金库：存款人投票，监察者核验。",
    "Live · Launch": "已上线 · 发行",
    "Live · Staking": "已上线 · 质押",
    "Soon · Launch": "即将 · 发行",
    "Soon · Staking": "即将 · 质押",
    "Weekly · Fees": "每周 · 手续费",
    "Next · Governance": "下一步 · 治理",
    "Launched on Pons, the Robinhood Chain launchpad. At graduation its liquidity moves to Uniswap and stays locked.":
        "已在 Robinhood Chain 的发射平台 Pons 上线。毕业时流动性转入 Uniswap 并永久锁定。",
    "Launches on Pons, the Robinhood Chain launchpad. At graduation its liquidity moves to Uniswap and stays locked.":
        "将在 Robinhood Chain 的发射平台 Pons 上线。毕业时流动性转入 Uniswap 并永久锁定。",
    "Staking opens right after the launch. Stake $RECURVE, run a watcher, and rule on every proposal.":
        "上线后质押随即开放。质押 $RECURVE，运行监察者，对每一份提案作出裁决。",
    "Staking is open. Stake $RECURVE, run a watcher, and rule on every proposal.":
        "质押已开放。质押 $RECURVE，运行监察者，对每一份提案作出裁决。",
    "The treasury pays out every week: watchers who voted, buy-and-burn, operations.":
        "金库储备每周发放：参与投票的监察者、回购销毁、运营开支。",
    ">copy<": ">复制<",  # tag-bound: a bare "copy" also hits class="copy"
    # ---------------------------------------------------------------- buy
    "Buy $RECURVE": "购买 $RECURVE",
    "The stake behind every watcher verdict.": "每一次监察者裁决背后的质押。",
    "Not launched yet.": "尚未上线。",
    "There is no $RECURVE token at this time. No presale, no allocations, no early access.":
        "目前不存在 $RECURVE 代币。没有预售，没有份额分配，没有早期通道。",
    "Any contract address claiming to be $RECURVE is fake. When it launches, the address appears on this page first.":
        "任何自称是 $RECURVE 的合约地址都是假的。上线时，地址会首先出现在本页。",
    "Read the tokenomics": "查看代币经济",
    ">Price<": ">价格<",  # tag-bound: a bare "Price" also hits id="pillPrice" and id="sPrice"
    "Market cap": "市值",
    "24h volume": "24 小时成交量",
    "Buy on Uniswap": "在 Uniswap 购买",
    "Explorer": "区块浏览器",
    "Figures come from onchain pool data and refresh every 30 seconds.":
        "数据来自链上流动性池，每 30 秒刷新一次。",
    "Buy on Pons": "在 Pons 购买",
    "Trading on its Pons curve. The numbers and the chart appear here once Dexscreener lists the pool.":
        "正在 Pons 联合曲线上交易。Dexscreener 收录流动性池后，这里会显示数据与走势图。",
    "Test address. This is not $RECURVE - do not buy it.": "测试地址。这不是 $RECURVE，请勿购买。",
    ">copy<": ">复制<",  # tag-bound: a bare "copy" also hits class="copy"
}

# Titles carry the site name, so handle them separately.
TITLES = {
    "<title>Recurve</title>": "<title>Recurve</title>",
    "<title>Product - Recurve</title>": "<title>产品 - Recurve</title>",
    "<title>$RECURVE - Recurve</title>": "<title>$RECURVE - Recurve</title>",
    "<title>Watchers - Recurve</title>": "<title>监察者 - Recurve</title>",
    "<title>App - Recurve</title>": "<title>应用 - Recurve</title>",
    "<title>$RECURVE price - Recurve</title>": "<title>$RECURVE 价格 - Recurve</title>",
}

META = {
    "Capital infrastructure for autonomous funds. Agents propose, depositors vote, watchers verify.":
        "自主基金的资本基础设施。智能体提案，存款人投票，监察者核验。",
    "Deposit into funds an agent proposes and executes. Every call is public, every strategy is voted on.":
        "存入由智能体提案并执行的基金。每一次调用都公开，每一项策略都经过投票。",
    "$RECURVE is the stake behind every watcher verdict. Capital backing capital.":
        "$RECURVE 是每一次监察者裁决背后的质押。以资本担保资本。",
    "A staked network of agents that replays strategy calldata before capital moves.":
        "一个由智能体组成的质押网络，在资金转移前重放策略调用数据。",
    "Price, market cap, and liquidity for $RECURVE on Robinhood Chain.":
        "$RECURVE 在 Robinhood Chain 上的价格、市值与流动性。",
}


def translate(text: str) -> str:
    # Longest first: "Watchers online" must not be hit by "Watchers".
    for src in sorted(T, key=len, reverse=True):
        text = text.replace(src, T[src])
    return text


def build():
    os.makedirs(OUT, exist_ok=True)

    for page in PAGES:
        src = os.path.join(ROOT, page)
        if not os.path.exists(src):
            print(f"  skip {page}")
            continue

        c = open(src, encoding="utf-8").read()

        c = c.replace('<html lang="en">', '<html lang="zh-CN">')

        for a, b in TITLES.items():
            c = c.replace(a, b)
        for a, b in META.items():
            c = c.replace(a, b)

        c = translate(c)

        # The link preview: same title as the tab, and its own address.
        title = re.search(r"<title>(.*?)</title>", c).group(1)
        c = re.sub(r'(<meta property="og:title" content=")[^"]*(">)',
                   lambda m: m.group(1) + title + m.group(2), c)
        c = c.replace('property="og:url" content="https://www.recurvemoney.xyz/',
                      'property="og:url" content="https://www.recurvemoney.xyz/zh/')

        # Swap the switcher first. Rewriting href="/" afterwards would also
        # rewrite the EN link and strand a visitor inside one language.
        c = c.replace(
            '<div class="langs"><a class="on" href="/">EN</a><a href="/zh/">中文</a></div>',
            '<div class="langs">LANGSWITCH</div>')

        # Internal links point inside /zh so a visitor stays in their language.
        c = re.sub(r'href="/(product|token|watchers|buy)"',
                   r'href="/zh/\1"', c)
        c = re.sub(r'href="/"(\s|>)', r'href="/zh/"\1', c)

        c = c.replace(
            '<div class="langs">LANGSWITCH</div>',
            '<div class="langs"><a href="/">EN</a><a class="on" href="/zh/">中文</a></div>')

        open(os.path.join(OUT, page), "w", encoding="utf-8").write(c)
        print(f"  zh/{page}")

    print(f"\n{len(PAGES)} pages")


if __name__ == "__main__":
    build()

