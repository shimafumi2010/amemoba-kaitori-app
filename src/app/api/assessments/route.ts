import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE!

// Server-side 専用クライアント（service role）
const ssv = createClient(supabaseUrl, serviceKey)

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const customer = (body.customer ?? {}) as {
      name?: string
      phone?: string
      address?: string
      name_kana?: string
      birthday?: string
      job?: string
    }

    const device = (body.device ?? {}) as {
      model_name?: string
      model_number?: string
      imei?: string
      color?: string
      capacity?: string
      carrier?: string
      sim_lock?: string
      battery?: string
      condition?: string
      max_price?: number | null
      estimated_price?: number | null
      notes?: string
    }

    const chatwork_text: string | undefined = body.chatwork_text

    // 1) 顧客を upsert（電話番号があればキーにする / なければ名前で最後のを流用）
    let customerId: string | null = null

    if (customer.phone && customer.phone.trim() !== '') {
      // 同一電話番号があれば上書き、なければ作成
      const { data: existing, error: findErr } = await ssv
        .from('customers')
        .select('id')
        .eq('phone', customer.phone)
        .limit(1)
        .maybeSingle()

      if (findErr) throw findErr

      if (existing?.id) {
        const { error: upErr } = await ssv
          .from('customers')
          .update({
            name: customer.name ?? undefined,
            name_kana: customer.name_kana ?? undefined,
            address: customer.address ?? undefined,
            job: customer.job ?? undefined,
          })
          .eq('id', existing.id)

        if (upErr) throw upErr
        customerId = existing.id
      } else {
        const { data: ins, error: insErr } = await ssv
          .from('customers')
          .insert({
            name: customer.name ?? 'お客様',
            name_kana: customer.name_kana ?? null,
            address: customer.address ?? null,
            phone: customer.phone ?? null,
            job: customer.job ?? null,
            birthday: customer.birthday ?? null
          })
          .select('id')
          .single()

        if (insErr) throw insErr
        customerId = ins?.id ?? null
      }
    } else {
      // phoneが無い場合は作成
      const { data: ins, error: insErr } = await ssv
        .from('customers')
        .insert({
          name: customer.name ?? 'お客様',
          name_kana: customer.name_kana ?? null,
          address: customer.address ?? null,
          phone: customer.phone ?? null,
          job: customer.job ?? null,
          birthday: customer.birthday ?? null
        })
        .select('id')
        .single()

      if (insErr) throw insErr
      customerId = ins?.id ?? null
    }

    // 2) 端末を保存（customer_id 紐づけ）
    const { data: dev, error: devErr } = await ssv
      .from('devices')
      .insert({
        customer_id: customerId,
        model_name: device.model_name ?? null,
        model_number: device.model_number ?? null,
        imei: device.imei ?? null,
        color: device.color ?? null,
        capacity: device.capacity ?? null,
        carrier: device.carrier ?? null,
        sim_lock: device.sim_lock ?? null,
        battery: device.battery ?? null,
        condition: device.condition ?? null,
        max_price: device.max_price ?? null,
        estimated_price: device.estimated_price ?? null,
        notes: device.notes ?? null
      })
      .select('id')
      .single()

    if (devErr) throw devErr
    const deviceId = dev?.id ?? null

    // 3) 査定(assessments) を保存
    const { data: asmt, error: asmtErr } = await ssv
      .from('assessments')
      .insert({
        customer_id: customerId,
        device_id: deviceId,
        chatwork_text: chatwork_text ?? null,
        max_price: device.max_price ?? null,
        estimated_price: device.estimated_price ?? null,
        notes: device.notes ?? null
      })
      .select('id, assessed_at')
      .single()

    if (asmtErr) throw asmtErr

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      device_id: deviceId,
      assessment_id: asmt?.id,
      assessed_at: asmt?.assessed_at
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
