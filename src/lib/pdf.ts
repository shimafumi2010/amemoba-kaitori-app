import { PDFDocument, StandardFonts } from 'pdf-lib'

export async function generateDeliveryPDF(data: { customer: string; model: string; price: number }) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('アメモバ 買取納品書', { x: 200, y: 800, size: 20, font })
  page.drawText(`お名前：${data.customer}`, { x: 50, y: 760, size: 12, font })
  page.drawText(`機種：${data.model}`, { x: 50, y: 740, size: 12, font })
  page.drawText(`査定額：¥${data.price.toLocaleString()}`, { x: 50, y: 720, size: 12, font })
  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
