import AdminCreatePackageForm from './AdminCreatePackageForm'
import AdminPaymentOrderRowActions from './AdminPaymentOrderRowActions'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatPoints, toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

export default async function AdminPointsPage() {
  await requireAdmin()

  const [packages, paymentOrders] = await Promise.all([
    prisma.pointsPackage.findMany({
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
    prisma.paymentOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: true,
        paymentPackage: true,
      },
    }),
  ])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">积分与充值</h1>
          </div>
        </div>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">积分包</h2>
          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">名称</th>
                    <th className="pb-3 pr-4">积分</th>
                    <th className="pb-3 pr-4">价格</th>
                    <th className="pb-3 pr-4">排序</th>
                    <th className="pb-3">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="py-4 pr-4 text-slate-700">{item.name}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatPoints(toDisplayPoints(item.points))}</td>
                      <td className="py-4 pr-4 text-slate-700">¥{(item.priceCents / 100).toFixed(2)}</td>
                      <td className="py-4 pr-4 text-slate-700">{item.displayOrder}</td>
                      <td className="py-4 text-slate-700">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminCreatePackageForm />
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">最近充值订单</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">用户</th>
                  <th className="pb-3 pr-4">商户单号</th>
                  <th className="pb-3 pr-4">套餐</th>
                  <th className="pb-3 pr-4">金额</th>
                  <th className="pb-3 pr-4">状态</th>
                  <th className="pb-3 pr-4">时间</th>
                  <th className="pb-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {paymentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-slate-200">
                    <td className="py-4 pr-4 text-slate-700">{order.user.email}</td>
                    <td className="py-4 pr-4 text-slate-700">{order.outTradeNo || '-'}</td>
                    <td className="py-4 pr-4 text-slate-700">{order.paymentPackage.name}</td>
                    <td className="py-4 pr-4 text-slate-700">¥{(order.amountCents / 100).toFixed(2)}</td>
                    <td className="py-4 pr-4 text-slate-700">{order.status}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(order.createdAt)}</td>
                    <td className="py-4 text-slate-700">
                      <AdminPaymentOrderRowActions order={{ id: order.id, outTradeNo: order.outTradeNo, status: order.status }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
