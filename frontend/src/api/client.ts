// Axios client. CRITICAL: baseURL is relative ('api/'), so calls work behind the
// Workbench proxy at https://.../app/<UUID>/proxy/8080/api/...
import axios from 'axios'

export const api = axios.create({
  baseURL: 'api/',
  timeout: 60_000,
})
