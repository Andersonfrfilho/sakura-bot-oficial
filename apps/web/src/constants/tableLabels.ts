export type TableStatus = 'available' | 'occupied' | 'reserved'

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Disponível',
  occupied: 'Ocupada',
  reserved: 'Reservada',
}

export const TABLE_STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-green-100 text-green-800 border-green-200',
  occupied: 'bg-red-100 text-red-800 border-red-200',
  reserved: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export const TABLE_STATUS_CARD: Record<TableStatus, string> = {
  available: 'border-green-200 bg-green-50',
  occupied: 'border-red-200 bg-red-50',
  reserved: 'border-yellow-200 bg-yellow-50',
}
