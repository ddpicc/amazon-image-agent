import RechargePaymentPage from '../RechargePaymentPage'

interface RechargePayPageProps {
  searchParams?: {
    outTradeNo?: string
  }
}

export default function RechargePayPage({ searchParams }: RechargePayPageProps) {
  return <RechargePaymentPage outTradeNo={String(searchParams?.outTradeNo ?? '')} />
}

