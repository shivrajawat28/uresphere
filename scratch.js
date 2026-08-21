import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data, error } = await supabase.from('subjects').select('*').ilike('name', '%syllabus%')
  console.log("Syllabus subjects:", data, error)
  if (data && data.length > 0) {
    const ids = data.map(d => d.id)
    const res = await supabase.from('subjects').delete().in('id', ids)
    console.log("Deleted:", res)
  }
}
run()
