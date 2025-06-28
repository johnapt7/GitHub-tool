# GitHub Workflow Automation Frontend

A modern, production-quality React/Next.js frontend for the GitHub Workflow Automation Backend system.

## Features

### 🎯 Core Pages
- **Dashboard**: Real-time statistics, execution charts, workflow overview, and system health
- **Workflows**: Complete CRUD interface for workflow management with search and filtering
- **Executions**: Real-time monitoring of workflow executions with detailed history
- **Audit Logs**: Comprehensive activity tracking across the system
- **Settings**: System configuration including GitHub integration and security settings

### 🎨 Design & UX
- **Modern UI**: Clean, professional design with Tailwind CSS
- **Responsive Layout**: Optimized for desktop, tablet, and mobile devices
- **Interactive Components**: Smooth animations and transitions
- **Accessibility**: WCAG compliant with proper ARIA labels and keyboard navigation
- **Dark Mode Ready**: Color system designed to support dark theme

### ⚡ Technical Features
- **Next.js 14**: Latest App Router with Server Components
- **TypeScript**: Full type safety with comprehensive type definitions
- **Real-time Updates**: WebSocket integration for live execution monitoring
- **State Management**: React Query for efficient data fetching and caching
- **Performance**: Optimized with lazy loading and code splitting
- **Testing Ready**: Jest and Testing Library setup for comprehensive testing

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Dashboard
│   │   ├── workflows/         # Workflow management
│   │   ├── executions/        # Execution monitoring
│   │   ├── audit-logs/        # Audit log viewer
│   │   └── settings/          # System settings
│   ├── components/            # Reusable UI components
│   │   ├── dashboard/         # Dashboard-specific components
│   │   ├── layout/           # Layout components (Header, Sidebar)
│   │   └── providers/        # Context providers
│   ├── types/                # TypeScript type definitions
│   └── utils/                # Utility functions
├── public/                   # Static assets
└── package.json             # Dependencies and scripts
```

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Running backend API (see main README)

### Installation

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your backend API URL
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Visit `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Key Components

### Dashboard Components
- **DashboardStats**: Real-time system statistics
- **ExecutionChart**: Interactive execution trends chart
- **WorkflowOverview**: Quick workflow status overview
- **RecentExecutions**: Live execution feed
- **SystemHealth**: System status and resource monitoring

### Layout Components
- **Sidebar**: Navigation with active state management
- **Header**: Search, notifications, and user menu
- **Providers**: Application-wide context providers

### Data Flow
1. **API Integration**: React Query for data fetching and caching
2. **Real-time Updates**: Socket.io for live execution updates
3. **State Management**: React hooks for local state
4. **Type Safety**: TypeScript interfaces matching backend models

## API Integration

The frontend integrates with the backend API for:
- Workflow CRUD operations
- Execution monitoring and control
- Audit log retrieval
- System health checks
- Real-time WebSocket events

### Sample API Calls
```typescript
// Fetch workflows
const { data: workflows } = useQuery('workflows', () => 
  api.get('/api/workflows')
);

// Create workflow
const createWorkflow = useMutation((workflow: WorkflowFormData) =>
  api.post('/api/workflows', workflow)
);

// Monitor executions
useWebSocket('/executions', {
  onMessage: (event) => {
    // Handle real-time execution updates
  }
});
```

## Styling

### Tailwind CSS Configuration
- **Color System**: Custom color palette with primary, success, warning, and error variants
- **Typography**: Inter font with responsive sizing
- **Components**: Utility-first approach with custom component classes
- **Responsive**: Mobile-first responsive design

### Design Tokens
```css
/* Primary Colors */
--primary-600: #9333ea;
--primary-700: #7c3aed;

/* Status Colors */
--success-500: #10b981;
--warning-500: #f59e0b;
--error-500: #ef4444;
```

## Performance Optimizations

1. **Code Splitting**: Automatic route-based splitting
2. **Image Optimization**: Next.js Image component
3. **Bundle Analysis**: Webpack bundle analyzer integration
4. **Caching**: React Query for intelligent data caching
5. **Lazy Loading**: Dynamic imports for heavy components

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Contributing

1. Follow the existing code style and patterns
2. Use TypeScript for all new components
3. Add proper error handling and loading states
4. Include responsive design considerations
5. Test components with various data states

## Production Deployment

### Build Process
```bash
npm run build
npm run start
```

### Environment Variables
```bash
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_WS_URL=wss://api.your-domain.com
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

This frontend provides a complete, production-ready interface for the GitHub Workflow Automation system with modern development practices and excellent user experience.