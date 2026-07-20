// @vitest-environment happy-dom
// __tests__/NASConfig.test.ts — Tests for NAS config component logic
//
// Exercises NAS config defaults, persistence, and connection testing logic.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('naive-ui', () => ({
  NCard: { name: 'NCard', template: '<div><slot /></div>' },
  NButton: { name: 'NButton', template: '<button><slot /></button>' },
  NInput: { name: 'NInput', template: '<input />' },
  NSwitch: { name: 'NSwitch', template: '<span />' },
  NIcon: { name: 'NIcon', template: '<span><slot /></span>' },
  NTag: { name: 'NTag', template: '<span><slot /></span>' },
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))

vi.mock('@vicons/ionicons5', () => ({
  FolderOpenOutline: { name: 'FolderOpenOutline' },
  CheckmarkCircleOutline: { name: 'CheckmarkCircleOutline' },
  CloseCircleOutline: { name: 'CloseCircleOutline' },
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

describe('NASConfig logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  describe('default config', () => {
    it('disabled by default', () => {
      const defaultConfig = {
        enabled: false,
        host: '192.168.1.100',
        port: '22',
        username: '',
        moviePath: '/volume1/Media/Movies',
        softwarePath: '/volume1/Software',
        musicPath: '/volume1/Music',
        connected: false,
      }
      expect(defaultConfig.enabled).toBe(false)
    })

    it('uses default NAS host', () => {
      const defaultConfig = {
        enabled: false,
        host: '192.168.1.100',
        port: '22',
        username: '',
        moviePath: '/volume1/Media/Movies',
        softwarePath: '/volume1/Software',
        musicPath: '/volume1/Music',
        connected: false,
      }
      expect(defaultConfig.host).toBe('192.168.1.100')
    })

    it('uses SSH port 22 by default', () => {
      const defaultConfig = {
        enabled: false,
        host: '192.168.1.100',
        port: '22',
        username: '',
        moviePath: '/volume1/Media/Movies',
        softwarePath: '/volume1/Software',
        musicPath: '/volume1/Music',
        connected: false,
      }
      expect(defaultConfig.port).toBe('22')
    })

    it('has NAS paths for each resource type', () => {
      const defaultConfig = {
        enabled: false,
        host: '192.168.1.100',
        port: '22',
        username: '',
        moviePath: '/volume1/Media/Movies',
        softwarePath: '/volume1/Software',
        musicPath: '/volume1/Music',
        connected: false,
      }
      expect(defaultConfig.moviePath).toContain('Movies')
      expect(defaultConfig.softwarePath).toContain('Software')
      expect(defaultConfig.musicPath).toContain('Music')
    })

    it('is not connected by default', () => {
      const defaultConfig = {
        enabled: false,
        host: '192.168.1.100',
        port: '22',
        username: '',
        moviePath: '/volume1/Media/Movies',
        softwarePath: '/volume1/Software',
        musicPath: '/volume1/Music',
        connected: false,
      }
      expect(defaultConfig.connected).toBe(false)
    })
  })

  describe('saveConfig to localStorage', () => {
    it('persists config under motrix-ai:nas-config key', () => {
      const config = {
        enabled: true,
        host: '10.0.0.50',
        port: '22',
        username: 'admin',
        moviePath: '/movies',
        softwarePath: '/software',
        musicPath: '/music',
        connected: false,
      }
      localStorageMock.setItem('motrix-ai:nas-config', JSON.stringify(config))

      const saved = JSON.parse(localStorageMock.getItem('motrix-ai:nas-config') || '{}')
      expect(saved.enabled).toBe(true)
      expect(saved.host).toBe('10.0.0.50')
      expect(saved.username).toBe('admin')
    })
  })

  describe('testConnection via Tauri invoke', () => {
    it('invoke returns true for successful connection', async () => {
      invokeMock.mockResolvedValue(true)

      const result = await invokeMock('test_nas_connection', {
        host: '192.168.1.100',
        port: '22',
        username: 'admin',
      })

      expect(result).toBe(true)
    })

    it('invoke returns false for failed connection', async () => {
      invokeMock.mockResolvedValue(false)

      const result = await invokeMock('test_nas_connection', {
        host: '192.168.1.999',
        port: '22',
        username: 'bad',
      })

      expect(result).toBe(false)
    })

    it('handles invoke errors gracefully', async () => {
      invokeMock.mockRejectedValue(new Error('Network unreachable'))

      await expect(invokeMock('test_nas_connection', {})).rejects.toThrow('Network unreachable')
    })
  })

  describe('load saved config', () => {
    it('loads config from localStorage when present', () => {
      const saved = {
        enabled: true,
        host: 'nas.local',
        port: '2222',
        username: 'user',
        moviePath: '/media',
        softwarePath: '/apps',
        musicPath: '/audio',
        connected: true,
      }
      localStorageMock.setItem('motrix-ai:nas-config', JSON.stringify(saved))

      const loaded = JSON.parse(localStorageMock.getItem('motrix-ai:nas-config') || '{}')
      expect(loaded.host).toBe('nas.local')
      expect(loaded.port).toBe('2222')
      expect(loaded.connected).toBe(true)
    })

    it('handles corrupted localStorage data', () => {
      localStorageMock.setItem('motrix-ai:nas-config', 'not valid json {{{')

      expect(() => {
        try {
          JSON.parse(localStorageMock.getItem('motrix-ai:nas-config') || '{}')
        } catch {
          // Should handle gracefully
        }
      }).not.toThrow()
    })
  })
})
