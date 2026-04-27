import { colors, PaletteMode } from '@mui/material';

export const getDesignTokens = (mode: PaletteMode, isAdmin: boolean = false) => ({
  palette: {
    mode,
    primary: {
      // Logic: Admin gets Slate, App gets Duka Green
      main: isAdmin ? '#1e293b' : '#0073AA',
    },
    secondary: {
      // Logic: Admin gets Indigo, App gets Duka Orange
      main: isAdmin ? '#6366f1' : colors.orange[500],
    },
    // The conditional spread: ensures the objects are merged correctly
    ...(mode === 'dark'
      ? {
          background: {
            default: isAdmin ? '#0f172a' : '#0f0f0f',
            paper: isAdmin ? '#1e293b' : '#272727',
          },
        }
      : {
          background: {
            default: isAdmin ? '#f1f5f9' : '#f6f7f9',
            paper: '#ffffff',
          },
        }), // Ensure this closing parenthesis is here
  },
});
