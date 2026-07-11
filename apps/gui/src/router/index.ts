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
  ],
})

router.beforeEach((to) => {
  if (to.name === 'main') {
    try {
      const onboarded = localStorage.getItem('motrix-ai:onboarded')
      if (!onboarded) {
        return { name: 'onboarding' }
      }
    } catch {
      /* localStorage unavailable */
    }
  }
})

export default router
