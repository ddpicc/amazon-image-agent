const BEIJING_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const BEIJING_SHORT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTimeInBeijing(value: Date | string | number) {
  return BEIJING_DATE_TIME_FORMATTER.format(new Date(value))
}

export function formatNullableDateTimeInBeijing(value: Date | string | number | null | undefined) {
  return value ? formatDateTimeInBeijing(value) : '-'
}

export function formatShortDateTimeInBeijing(value: Date | string | number) {
  return BEIJING_SHORT_DATE_TIME_FORMATTER.format(new Date(value))
}
