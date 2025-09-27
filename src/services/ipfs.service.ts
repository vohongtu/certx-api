import axios from 'axios'

const endpoint = 'https://api.web3.storage/upload' // hoặc Pinata

export async function uploadJSON(token: string, obj: any) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' })
  const res = await fetch(endpoint, { 
    method: 'POST', 
    headers: { Authorization: `Bearer ${token}` }, 
    body: blob 
  })
  
  if (!res.ok) throw new Error('IPFS upload fail')
  const cid = (await res.json()).cid
  return `ipfs://${cid}`
}
