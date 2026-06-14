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
      path: '/legacy',
      name: 'legacy',
      component: () => import('@/views/MainView.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: () => import('@/views/QueueView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsNewView.vue'),
    },
    {
      path: '/settings-legacy',
      name: 'settings-legacy',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
    },
  ],
})

export default router
