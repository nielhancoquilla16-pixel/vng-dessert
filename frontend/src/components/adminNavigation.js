import {
  BarChart3,
  Box,
  CalendarClock,
  ClipboardList,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  ScanQrCode,
  Settings,
  Store,
  Users,
  createLucideIcon,
} from 'lucide-react';

// Use Lucide's renderer so this register shares the other icons' size and stroke.
const CashRegister = createLucideIcon('CashRegister', [
  ['rect', { x: 6, y: 2, width: 12, height: 5, rx: 1, key: 'display' }],
  ['path', { d: 'M8 7v3m8-3v3M5 10h14l2 7H3l2-7Z', key: 'body' }],
  ['rect', { x: 3, y: 17, width: 18, height: 5, rx: 1, key: 'drawer' }],
  ['path', { d: 'M8 13h1m3 0h1m3 0h1M10 19.5h4', key: 'keys' }],
]);

const sharedRoles = ['admin', 'staff'];

const navigationSections = [
  {
    id: 'main',
    label: 'Main Menu',
    items: [
      { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutGrid, roles: ['admin'], color: '#ffb000' },
      { name: 'Products', path: '/admin/products', icon: Box, roles: sharedRoles, color: '#a76bff' },
      { name: 'Orders', path: '/admin/orders', icon: ClipboardList, roles: sharedRoles, color: '#ff48ad' },
      { name: 'Pre-Orders', path: '/admin/pre-orders', icon: CalendarClock, roles: sharedRoles, color: '#ff48ad' },
      { name: 'POS System', path: '/admin/pos', icon: CashRegister, roles: sharedRoles, color: '#00d4ed' },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    items: [
      { name: 'Inventory', path: '/admin/inventory', icon: Box, roles: sharedRoles, color: '#15e6aa' },
      { name: 'Reports', path: '/admin/reports', icon: BarChart3, roles: sharedRoles, color: '#00aaff' },
      { name: 'Feedback', path: '/admin/feedback', icon: MessageSquareText, roles: sharedRoles, color: '#ac68ff' },
      { name: 'QR Scanner', path: '/admin/qr', icon: ScanQrCode, roles: sharedRoles, color: '#ffb000' },
      { name: 'Staff Management', path: '/admin/staff', icon: Users, roles: ['admin'], color: '#ff3b7c' },
      { name: 'Site Content', path: '/admin/content', icon: Settings, roles: ['admin'], color: '#ac68ff' },
    ],
  },
  {
    id: 'store',
    label: 'Store',
    items: [
      { name: 'Back to Store', path: '/', icon: Store, roles: sharedRoles, color: '#ffb000' },
      { name: 'Logout', action: 'logout', icon: LogOut, roles: sharedRoles, color: '#ff3b7c' },
    ],
  },
];

export const getNavigationSections = (role) => navigationSections
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  }))
  .filter((section) => section.items.length > 0);
