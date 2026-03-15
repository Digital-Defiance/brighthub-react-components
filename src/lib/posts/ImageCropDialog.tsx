/**
 * ImageCropDialog — MUI Dialog for cropping an image before staging.
 *
 * Uses react-easy-crop for the crop UI with a rectangular guide and free-form
 * aspect ratio. On confirm, extracts the cropped region via canvas and passes
 * the resulting Blob to the parent via onCropComplete. The author can also
 * skip cropping entirely.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
import { BrightHubStrings } from '@brightchain/brighthub-lib';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { FC, memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import Cropper from 'react-easy-crop';
import { useBrightHubTranslation } from '../hooks/useBrightHubTranslation';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImageCropDialogProps {
  open: boolean;
  onClose: () => void;
  /** The image file to crop */
  imageFile: File;
  /** Called with the cropped image blob when confirmed */
  onCropComplete: (croppedBlob: Blob) => void;
  /** Called when the author skips cropping */
  onSkip: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const PREVIEW_MAX_HEIGHT = 200;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the cropped region from an image using a canvas element.
 * Returns a Blob of the cropped area in the original image's MIME type.
 */
async function getCroppedBlob(
  imageSrc: string,
  cropPixels: Area,
  mimeType: string,
): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = (err) => reject(err);
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2d context');
  }

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob returned null'));
        }
      },
      mimeType,
      0.92,
    );
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

const ImageCropDialog: FC<ImageCropDialogProps> = ({
  open,
  onClose,
  imageFile,
  onCropComplete,
  onSkip,
}) => {
  const { t } = useBrightHubTranslation();

  // Crop state
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Create object URL from the image file
  const imageObjectUrl = useMemo(() => {
    if (!imageFile) return '';
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  // Clean up object URL on unmount or when imageFile changes
  useEffect(() => {
    return () => {
      if (imageObjectUrl) {
        URL.revokeObjectURL(imageObjectUrl);
      }
    };
  }, [imageObjectUrl]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(MIN_ZOOM);
      setCroppedAreaPixels(null);
      setPreviewUrl(null);
      setConfirming(false);
    }
  }, [open]);

  // Clean up preview URL when it changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ─── Crop callbacks ─────────────────────────────────────────────────

  const handleCropChange = useCallback((location: Point) => {
    setCrop(location);
  }, []);

  const handleZoomChange = useCallback(
    (_: Event | React.SyntheticEvent, value: number | number[]) => {
      setZoom(value as number);
    },
    [],
  );

  const handleCropAreaComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);

      // Generate preview of the cropped result (Req 13.4)
      getCroppedBlob(
        imageObjectUrl,
        croppedPixels,
        imageFile.type || 'image/jpeg',
      )
        .then((blob) => {
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        })
        .catch(() => {
          // Preview generation is best-effort; don't block the user
        });
    },
    [imageObjectUrl, imageFile.type],
  );

  // ─── Confirm / Skip / Cancel ────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;

    setConfirming(true);
    try {
      const blob = await getCroppedBlob(
        imageObjectUrl,
        croppedAreaPixels,
        imageFile.type || 'image/jpeg',
      );
      onCropComplete(blob);
    } catch {
      // If cropping fails, fall back to skipping
      onSkip();
    } finally {
      setConfirming(false);
    }
  }, [
    croppedAreaPixels,
    imageObjectUrl,
    imageFile.type,
    onCropComplete,
    onSkip,
  ]);

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="image-crop-dialog-title"
      data-testid="image-crop-dialog"
    >
      <DialogTitle id="image-crop-dialog-title">
        {t(BrightHubStrings.ImageCropDialog_Title)}
      </DialogTitle>

      <DialogContent>
        {/* Crop area (Req 13.1, 13.3) */}
        {imageObjectUrl && (
          <>
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: 300,
                bgcolor: 'grey.900',
                borderRadius: 1,
                overflow: 'hidden',
              }}
              data-testid="crop-container"
            >
              <Cropper
                image={imageObjectUrl}
                crop={crop}
                zoom={zoom}
                cropShape="rect"
                onCropChange={handleCropChange}
                onZoomChange={setZoom}
                onCropComplete={handleCropAreaComplete}
                data-testid="image-cropper"
              />
            </Box>

            {/* Zoom slider */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <Typography variant="body2" id="image-zoom-slider-label">
                {t(BrightHubStrings.ImageCropDialog_ZoomLabel)}
              </Typography>
              <Slider
                value={zoom}
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                onChange={handleZoomChange}
                aria-labelledby="image-zoom-slider-label"
                data-testid="image-zoom-slider"
                sx={{ flex: 1 }}
              />
            </Box>

            {/* Cropped preview (Req 13.4) */}
            {previewUrl && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  mt: 2,
                }}
                data-testid="crop-preview-container"
              >
                <Typography variant="body2" color="text.secondary">
                  {t(BrightHubStrings.ImageCropDialog_PreviewAlt)}
                </Typography>
                <Box
                  component="img"
                  src={previewUrl}
                  alt={t(BrightHubStrings.ImageCropDialog_PreviewAlt)}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: PREVIEW_MAX_HEIGHT,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                  }}
                  data-testid="crop-preview-image"
                />
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel} disabled={confirming}>
          {t(BrightHubStrings.ImageCropDialog_Cancel)}
        </Button>
        <Button
          onClick={handleSkip}
          disabled={confirming}
          data-testid="crop-skip-button"
        >
          {t(BrightHubStrings.ImageCropDialog_Skip)}
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!croppedAreaPixels || confirming}
          data-testid="crop-confirm-button"
        >
          {t(BrightHubStrings.ImageCropDialog_Crop)}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default memo(ImageCropDialog);
