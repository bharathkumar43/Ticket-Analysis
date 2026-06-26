import { apiClient } from './client'
import { Person, Customer, Project, Ticket, JiraSyncRun, PaginatedResponse } from '../types'

export async function fetchPeople(role?: 'MANAGER' | 'ENGINEER'): Promise<Person[]> {
  const res = await apiClient.get('/people', { params: role ? { role } : {} })
  return res.data.data
}

export async function fetchCustomers(): Promise<Customer[]> {
  const res = await apiClient.get('/customers')
  return res.data.data
}

export async function fetchProjects(params?: Record<string, string>): Promise<PaginatedResponse<Project>> {
  const res = await apiClient.get('/projects', { params })
  return res.data
}

export async function fetchTickets(params?: Record<string, string>): Promise<PaginatedResponse<Ticket>> {
  const res = await apiClient.get('/tickets', { params })
  return res.data
}

export async function triggerJiraSync(): Promise<JiraSyncRun> {
  const res = await apiClient.post('/jira/sync')
  return res.data
}

export async function fetchJiraStatus(): Promise<{ lastRun: JiraSyncRun | null; schedule: string }> {
  const res = await apiClient.get('/jira/status')
  return res.data
}

export async function fetchJiraConfig(): Promise<any> {
  const res = await apiClient.get('/jira/config')
  return res.data
}

export async function testJiraConnection(): Promise<boolean> {
  const res = await apiClient.get('/jira/test')
  return res.data.connected
}
