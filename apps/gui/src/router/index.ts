import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'main',
      component: () => import('@/views/TaskFirstView.vue'),
    },
    {
      path: '/queue',
      redirect: '/',
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.name === 'main') {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const config = await invoke<{ ui?: { onboarded?: boolean } }>('load_config')
      if (!config?.ui?.onboarded) {
        return { name: 'onboarding' }
      }
    } catch {
      try {
        if (!localStorage.getItem('motrix-ai:onboarded')) {
          return { name: 'onboarding' }
        }
      } catch {
        /* non-Tauri context without localStorage */
      }
    }
  }
})

export default router
