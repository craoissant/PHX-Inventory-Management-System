
import { supabase } from './supabase'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers = {
    ...(options.headers || {}),
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  const url = `${API_BASE_URL}${path}`

  let response

  try {
    response = await fetch(url, {
      ...options,
      headers,
    })
  } catch (error) {
    console.error('Network error:', {
      url,
      message: error.message,
      error,
    })
    throw error
  }

  if (!response.ok) {
    const errorBody = await response.text()

    console.error('API error:', {
      url,
      status: response.status,
      body: errorBody,
    })

    throw new Error(
      `API request failed (${response.status}): ${errorBody}`
    )
  }

  return response.json()
}
