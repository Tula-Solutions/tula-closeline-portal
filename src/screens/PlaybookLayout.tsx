import { Outlet } from '@tanstack/react-router'

/** The Playbook section: its menu (Documents, Search) is in the sidebar, so this is only the page. */
export function PlaybookLayout() {
  return <Outlet />
}
