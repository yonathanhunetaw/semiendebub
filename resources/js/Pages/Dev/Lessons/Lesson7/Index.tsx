import Box from '@mui/material/Box';
import DevLayout from "@/Layouts/DevLayout";

export default function BoxBasic() {
  return (
    <Box component="section" sx={{ p: 2, border: '1px dashed grey' }}>
      This Box renders as an HTML section element.
    </Box>
  );
}

BoxBasic.layout = (page: any) => <DevLayout>{page}</DevLayout>;
