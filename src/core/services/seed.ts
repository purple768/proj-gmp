import { allDocs, createDoc, tbl } from '@/core/db/repo'
import { nextCode } from './number'
import { dayDiff, todayStart } from '@/shared/date'

/** 首次启动写入一套演示数据，避免空屏；已有数据则跳过 */
export async function ensureSeed(): Promise<boolean> {
  const projects = await allDocs('projects', null, true)
  if (projects.length) return false

  const now = Date.now()
  const today = todayStart()
  const project = await createDoc('projects', {
    code: await nextCode('XM', now),
    name: '滨江路市政道路改造工程',
    status: '在建',
    ownerUnit: '市城市建设投资集团',
    buildUnit: '示例建工集团有限公司',
    supervisorUnit: '示例工程监理有限公司',
    contractNo: 'HT-2026-001',
    planStart: today - 60 * 86400000,
    planEnd: today + 120 * 86400000,
    actualStart: today - 55 * 86400000,
    reportCycle: '周',
    reportAnchor: 5,
    remark: '演示项目，可直接删除或在设置页清空全部数据'
  })

  const wbsDefs = [
    { code: '1', name: '道路工程', start: -60, end: 60, milestone: '否' },
    { code: '1.1', name: '路基土方', start: -60, end: -20, milestone: '否' },
    { code: '1.2', name: '水稳基层', start: -25, end: 5, milestone: '否' },
    { code: '1.3', name: '沥青面层', start: 0, end: 45, milestone: '否' },
    { code: '2', name: '排水工程', start: -50, end: 40, milestone: '否' },
    { code: '2.1', name: '雨水管道', start: -50, end: 0, milestone: '否' },
    { code: '2.2', name: '污水管道', start: -30, end: 30, milestone: '否' },
    { code: '3', name: '交通设施', start: 60, end: 110, milestone: '是' }
  ]
  const wbsMap: Record<string, string> = {}
  for (const w of wbsDefs) {
    const parentCode = w.code.includes('.') ? w.code.slice(0, w.code.lastIndexOf('.')) : null
    const row = await createDoc('wbs', {
      projectId: project.id,
      parentId: parentCode ? wbsMap[parentCode] : null,
      code: w.code,
      name: w.name,
      milestone: w.milestone,
      planStart: today + w.start * 86400000,
      planEnd: today + w.end * 86400000,
      enabled: true
    })
    wbsMap[w.code] = row.id
  }

  const contracts = await createDoc('contracts', {
    projectId: project.id,
    code: await nextCode('HT', now),
    name: '滨江路市政道路改造工程施工总承包合同',
    partyA: '市城市建设投资集团',
    partyB: '示例建工集团有限公司',
    amount: 28600000,
    signDate: today - 75 * 86400000,
    duration: 240,
    payTerms: '按月计量支付，结算后支付至 97%，留 3% 质保金',
    status: '正常'
  })

  await createDoc('budgets', {
    projectId: project.id,
    wbsId: wbsMap['1.1'],
    code: await nextCode('YS', now),
    category: '人工',
    amount: 3200000,
    desc: '路基土方人工及机械配合'
  })
  await createDoc('budgets', {
    projectId: project.id,
    wbsId: wbsMap['1.2'],
    code: await nextCode('YS', now),
    category: '材料',
    amount: 5600000,
    desc: '水稳混合料'
  })

  await createDoc('expenses', {
    projectId: project.id,
    wbsId: wbsMap['1.1'],
    code: await nextCode('ZC', now),
    category: '人工',
    amount: 3350000,
    occurDate: today - 10 * 86400000,
    voucherNo: 'PZ-0021',
    desc: '路基班组 9 月计量'
  })

  await createDoc('visas', {
    projectId: project.id,
    contractId: contracts.id,
    wbsId: wbsMap['1.2'],
    code: await nextCode('QZ', now),
    reason: '地下障碍物清除',
    content: '水稳基层施工范围内发现废弃管线，人工配合机械清除并外运',
    unit: '项',
    qty: 1,
    price: 86000,
    total: 86000,
    confirmStatus: '已确认',
    visaDate: today - 12 * 86400000,
    supervisorOpinion: '情况属实，同意按此计量'
  })

  await createDoc('submissions', {
    projectId: project.id,
    contractId: contracts.id,
    code: await nextCode('BS', now),
    periodStart: today - 30 * 86400000,
    periodEnd: today - 1 * 86400000,
    amount: 2860000,
    desc: '本期完成路基与水稳基层',
    auditStatus: '已审核'
  })

  await createDoc('settlements', {
    projectId: project.id,
    contractId: contracts.id,
    code: await nextCode('JS', now),
    totalAmount: 8600000,
    receivedAmount: 5200000,
    unreceived: 3400000,
    settleDate: today - 45 * 86400000,
    status: '部分收款',
    desc: '第一阶段结算'
  })

  await createDoc('hazards', {
    projectId: project.id,
    wbsId: wbsMap['1.2'],
    code: await nextCode('YH', now),
    level: '重大',
    location: 'K1+200 水稳摊铺段',
    desc: '临边未设置防护栏，夜间照明不足',
    requirement: '立即增设防护栏杆与警示灯，班前教育后复查',
    deadline: today - 2 * 86400000,
    finder: '张安全',
    team: '水稳班组',
    status: '待整改'
  })

  await createDoc('hazards', {
    projectId: project.id,
    wbsId: wbsMap['1.1'],
    code: await nextCode('YH', now),
    level: '一般',
    location: '土方开挖区',
    desc: '个别工人未佩戴安全帽',
    requirement: '现场纠正并进行安全教育',
    deadline: today,
    finder: '张安全',
    status: '整改中'
  })

  await createDoc('certificates', {
    projectId: project.id,
    code: await nextCode('ZJ', now),
    holder: '李电工',
    team: '水电班组',
    jobType: '电工',
    certNo: 'DG-2024-00871',
    issuer: '市应急管理局',
    issueDate: today - 700 * 86400000,
    expireDate: today + 18 * 86400000
  })

  await createDoc('materialPlans', {
    projectId: project.id,
    wbsId: wbsMap['1.2'],
    code: await nextCode('XQ', now),
    materialName: '水泥稳定碎石',
    spec: '5% 水稳',
    unit: 't',
    qty: 1200,
    planDate: today + 5 * 86400000,
    status: '待采购'
  })

  await createDoc('materialReceipts', {
    projectId: project.id,
    wbsId: wbsMap['1.1'],
    code: await nextCode('JC', now),
    materialName: '碎石',
    spec: '5-25mm',
    unit: 't',
    qty: 800,
    supplier: '示例砂石有限公司',
    inspectRequired: '否',
    inDate: today - 8 * 86400000,
    location: '1# 料场',
    inspectResult: ''
  })

  await createDoc('teams', {
    projectId: project.id,
    code: await nextCode('BZ', now),
    name: '水稳班组',
    type: '混凝土',
    leader: '王班长',
    phone: '13800000001',
    inDate: today - 40 * 86400000,
    status: '在岗'
  })

  const progressDefs = [
    { code: '1.1', plan: 100, actual: 100, day: -5 },
    { code: '1.2', plan: 80, actual: 55, day: -1 },
    { code: '2.1', plan: 90, actual: 92, day: -1 }
  ]
  for (const p of progressDefs) {
    await createDoc('progressRecords', {
      projectId: project.id,
      wbsId: wbsMap[p.code],
      code: await nextCode('JD', now),
      cycle: '周',
      reportDate: today + p.day * 86400000,
      planRate: p.plan,
      actualRate: p.actual,
      imageProgress: `${p.code} 节点形象进度记录`
    })
  }

  await tbl('todayTodos').put({
    id: crypto.randomUUID(),
    text: '联系监理确认水稳基层验收时间',
    date: today,
    done: false,
    createdAt: Date.now()
  })

  return true
}
