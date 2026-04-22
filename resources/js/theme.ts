import { createTheme, colors, PaletteMode } from '@mui/material';

// Define the tokens with the proper type for mode
export const getDesignTokens = (mode: PaletteMode) => ({
  palette: {
    mode,
    primary: {
        main: '#006630',
    },
    secondary: {
        main: colors.orange[500],
    },
    ...(mode === 'dark' && {
        background: {
            default: '#0f0f0f',
            paper: '#272727',
        },
    }),
  },
});
