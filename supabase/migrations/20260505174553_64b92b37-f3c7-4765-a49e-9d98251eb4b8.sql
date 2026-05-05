-- Create the company-logos storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view logos
CREATE POLICY "Public can view company logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Authenticated users can upload logos
CREATE POLICY "Authenticated users can upload company logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

-- Authenticated users can update logos
CREATE POLICY "Authenticated users can update company logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos');

-- Authenticated users can delete logos
CREATE POLICY "Authenticated users can delete company logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos');