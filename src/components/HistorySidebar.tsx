'use client'

import Link from 'next/link'

interface HistoryItem {
  id: string
  productName: string
  timestamp: Date
  imageUrl: string
  prompt: string
  analysis: string
}

interface HistorySidebarProps {
  history: HistoryItem[]
  onSelectItem: (item: HistoryItem) => void
  onClearHistory: () => void
}

export default function HistorySidebar({ history, onSelectItem, onClearHistory }: HistorySidebarProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">历史记录</h3>
        <div className="flex items-center gap-3">
          <Link href="/history" className="text-xs text-amazon-blue hover:text-blue-600">
            查看全部
          </Link>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-red-500 hover:text-red-600"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">还没有历史记录</p>
      ) : (
        <div className="space-y-3 overflow-y-auto max-h-96">
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
            >
              <p className="font-medium text-gray-800 truncate">{item.productName}</p>
              <p className="text-xs text-gray-500 mt-1">{formatDate(item.timestamp)}</p>
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-full h-20 object-cover rounded mt-2"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
