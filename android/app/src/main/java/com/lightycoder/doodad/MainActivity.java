package com.lightycoder.doodad;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.util.Arrays;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int W = 12;
    private static final int H = 12;
    private static final int CELL_COUNT = W * H;
    private static final int BG = Color.rgb(245, 247, 250);
    private static final int PANEL = Color.WHITE;
    private static final int TEXT = Color.rgb(24, 30, 38);
    private static final int MUTED = Color.rgb(91, 101, 113);
    private static final int BLUE = Color.rgb(47, 125, 225);

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic commandChar;
    private TextView status;
    private LinearLayout content;
    private GridLayout padGrid;
    private ImageCropView imageCropView;
    private Bitmap sourceBitmap;
    private boolean imagePixelPreview = false;
    private final int[] pixels = new int[CELL_COUNT];
    private final boolean[] selected = new boolean[CELL_COUNT];
    private final Button[] cells = new Button[CELL_COUNT];
    private int selectedColor = Color.RED;
    private int brightness = 180;
    private boolean multiSelect = true;
    private boolean paintStarted = false;
    private int animationMode = 0;
    private int animationStep = 0;
    private boolean animationRunning = false;
    private int animationDelayMs = 260;

    private final Runnable animationTick = new Runnable() {
        @Override public void run() {
            if (!animationRunning) return;
            renderAnimationFrame(animationMode, animationStep++);
            sendPixels(false);
            main.postDelayed(this, animationDelayMs);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Arrays.fill(pixels, Color.BLACK);
        BluetoothManager manager = getSystemService(BluetoothManager.class);
        adapter = manager == null ? null : manager.getAdapter();
        scanner = adapter == null ? null : adapter.getBluetoothLeScanner();
        requestBlePermissions();
        buildShell();
        showPadPage();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.setBackgroundColor(BG);

        TextView title = new TextView(this);
        title.setText("LightyCoderDoodad");
        title.setTextColor(TEXT);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setTypeface(null, 1);
        root.addView(title);

        status = new TextView(this);
        status.setText("Disconnected");
        status.setTextColor(MUTED);
        status.setTextSize(14);
        root.addView(status);

        LinearLayout top = row();
        addButton(top, "Connect", v -> scanAndConnect(), 1, BLUE);
        addButton(top, "Start Paint", v -> startPaint(), 1, Color.rgb(42, 157, 93));
        addButton(top, "Disconnect", v -> disconnect(), 1, Color.rgb(210, 74, 74));
        root.addView(top);

        LinearLayout nav = row();
        addButton(nav, "Pad", v -> showPadPage(), 1, Color.rgb(230, 235, 241));
        addButton(nav, "Images", v -> showImagesPage(), 1, Color.rgb(230, 235, 241));
        addButton(nav, "Animations", v -> showAnimationsPage(), 1, Color.rgb(230, 235, 241));
        root.addView(nav);

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));
        return row;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PANEL);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), Color.rgb(218, 225, 232));
        card.setBackground(bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(12), 0, dp(12));
        card.setLayoutParams(params);
        return card;
    }

    private Button addButton(LinearLayout parent, String label, View.OnClickListener listener, int weight, int color) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(readableText(color));
        button.setTextSize(13);
        button.setOnClickListener(listener);
        button.setBackground(rounded(color, dp(1), darker(color), dp(9)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(46), weight);
        params.setMargins(dp(3), 0, dp(3), 0);
        parent.addView(button, params);
        return button;
    }

    private GradientDrawable rounded(int fill, int strokeWidth, int stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        drawable.setStroke(strokeWidth, stroke);
        return drawable;
    }

    private int darker(int color) {
        return Color.rgb(Color.red(color) * 82 / 100, Color.green(color) * 82 / 100, Color.blue(color) * 82 / 100);
    }

    private int readableText(int color) {
        return Color.red(color) + Color.green(color) + Color.blue(color) < 430 ? Color.WHITE : TEXT;
    }

    private void showPadPage() {
        animationRunning = false;
        content.removeAllViews();
        LinearLayout controls = card();
        controls.addView(label("Paint Pad"));
        controls.addView(text("Tap a square to paint it with the current colour. Selected cells have a blue outline."));
        addColorControls(controls);
        CheckBox multi = new CheckBox(this);
        multi.setText("Keep multiple cells selected");
        multi.setTextColor(TEXT);
        multi.setChecked(multiSelect);
        multi.setOnCheckedChangeListener((buttonView, isChecked) -> multiSelect = isChecked);
        controls.addView(multi);
        content.addView(controls);

        LinearLayout gridCard = card();
        padGrid = new GridLayout(this);
        padGrid.setColumnCount(W);
        padGrid.setUseDefaultMargins(false);
        for (int i = 0; i < CELL_COUNT; i++) {
            final int index = i;
            Button cell = new Button(this);
            cell.setText("");
            cell.setPadding(0, 0, 0, 0);
            cell.setMinWidth(0);
            cell.setMinimumWidth(0);
            cell.setMinHeight(0);
            cell.setMinimumHeight(0);
            cell.setOnClickListener(v -> paintCell(index));
            cell.setOnLongClickListener(v -> { pixels[index] = Color.BLACK; selected[index] = false; renderGrid(); return true; });
            cells[i] = cell;
            padGrid.addView(cell);
        }
        gridCard.addView(padGrid, new LinearLayout.LayoutParams(-1, -2));
        content.addView(gridCard);

        LinearLayout actions = card();
        LinearLayout row = row();
        addButton(row, "Send", v -> sendPixels(true), 1, BLUE);
        addButton(row, "Clear Selected", v -> clearSelection(), 1, Color.rgb(230, 235, 241));
        addButton(row, "Clear All", v -> clearAllPixels(), 1, Color.rgb(230, 235, 241));
        actions.addView(row);
        content.addView(actions);
        resizePadCells();
        renderGrid();
    }

    private void showImagesPage() {
        animationRunning = false;
        content.removeAllViews();
        LinearLayout panel = card();
        panel.addView(label("Images"));
        panel.addView(text("Load from gallery or files, then drag and pinch the preview. The visible square is sampled to 12x12 when you send."));

        LinearLayout sourceRow = row();
        addButton(sourceRow, "Gallery", v -> pickImageFromGallery(), 1, BLUE);
        addButton(sourceRow, "Files", v -> pickImageFromFiles(), 1, Color.rgb(230, 235, 241));
        addButton(sourceRow, "Send Image", v -> sendImageCrop(), 1, Color.rgb(42, 157, 93));
        panel.addView(sourceRow);

        LinearLayout cropRow = row();
        addButton(cropRow, "Centre Crop", v -> { if (imageCropView != null) imageCropView.resetCrop(); }, 1, Color.rgb(230, 235, 241));
        addButton(cropRow, "Fit", v -> { if (imageCropView != null) imageCropView.resetFit(); }, 1, Color.rgb(230, 235, 241));
        addButton(cropRow, "Zoom +", v -> { if (imageCropView != null) imageCropView.zoomBy(1.12f); }, 1, Color.rgb(230, 235, 241));
        addButton(cropRow, "Zoom -", v -> { if (imageCropView != null) imageCropView.zoomBy(0.90f); }, 1, Color.rgb(230, 235, 241));
        panel.addView(cropRow);

        CheckBox pixelPreview = new CheckBox(this);
        pixelPreview.setText("Pixel preview: show the exact 12x12 output");
        pixelPreview.setTextColor(TEXT);
        pixelPreview.setChecked(imagePixelPreview);
        pixelPreview.setOnCheckedChangeListener((buttonView, isChecked) -> {
            imagePixelPreview = isChecked;
            if (imageCropView != null) imageCropView.invalidate();
        });
        panel.addView(pixelPreview);

        imageCropView = new ImageCropView(this);
        imageCropView.setBitmap(sourceBitmap == null ? bitmapFromPixels12() : sourceBitmap);
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, -2);
        previewParams.setMargins(0, dp(8), 0, 0);
        panel.addView(imageCropView, previewParams);
        content.addView(panel);
    }

    private void showAnimationsPage() {
        content.removeAllViews();
        LinearLayout panel = card();
        panel.addView(label("Animations"));
        panel.addView(text("Generated on the phone and streamed as compact canvas frames."));
        addColorControls(panel);
        LinearLayout row1 = row();
        addButton(row1, "Wipe", v -> startAnimation(0), 1, BLUE);
        addButton(row1, "Pulse", v -> startAnimation(1), 1, BLUE);
        addButton(row1, "Rainbow", v -> startAnimation(2), 1, BLUE);
        panel.addView(row1);
        LinearLayout row2 = row();
        addButton(row2, "Heart", v -> startAnimation(3), 1, Color.rgb(226, 66, 112));
        addButton(row2, "Sparkle", v -> startAnimation(4), 1, BLUE);
        addButton(row2, "Scanner", v -> startAnimation(5), 1, BLUE);
        panel.addView(row2);
        LinearLayout row3 = row();
        addButton(row3, "Tetris", v -> startAnimation(6), 1, Color.rgb(236, 143, 40));
        addButton(row3, "Snake", v -> startAnimation(7), 1, Color.rgb(42, 157, 93));
        addButton(row3, "Comet", v -> startAnimation(8), 1, Color.rgb(119, 92, 232));
        panel.addView(row3);
        LinearLayout speedRow = row();
        addButton(speedRow, "Slower", v -> changeAnimationSpeed(60), 1, Color.rgb(230, 235, 241));
        addButton(speedRow, "Stop", v -> stopAnimation(), 1, Color.rgb(210, 74, 74));
        addButton(speedRow, "Faster", v -> changeAnimationSpeed(-60), 1, Color.rgb(230, 235, 241));
        panel.addView(speedRow);
        content.addView(panel);
    }

    private void addColorControls(LinearLayout parent) {
        TextView brush = text("Brush colour");
        brush.setTextColor(MUTED);
        parent.addView(brush);
        LinearLayout colours = row();
        addColourButton(colours, "Black", Color.BLACK);
        addColourButton(colours, "Red", Color.RED);
        addColourButton(colours, "Green", Color.GREEN);
        addColourButton(colours, "Blue", Color.BLUE);
        addColourButton(colours, "White", Color.WHITE);
        addColourButton(colours, "Yellow", Color.YELLOW);
        parent.addView(colours);
        TextView brightLabel = text("Brightness: " + brightness);
        parent.addView(brightLabel);
        SeekBar slider = new SeekBar(this);
        slider.setMax(255);
        slider.setProgress(brightness);
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                brightness = Math.max(1, progress);
                brightLabel.setText("Brightness: " + brightness);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        parent.addView(slider);
    }

    private void addColourButton(LinearLayout parent, String label, int color) {
        addButton(parent, label, v -> selectedColor = color, 1, color);
    }

    private TextView label(String text) {
        TextView view = text(text);
        view.setTextColor(TEXT);
        view.setTextSize(22);
        view.setTypeface(null, 1);
        view.setPadding(0, 0, 0, dp(8));
        return view;
    }

    private TextView text(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(MUTED);
        view.setTextSize(14);
        view.setPadding(0, dp(4), 0, dp(6));
        return view;
    }

    private void resizePadCells() {
        if (padGrid == null) return;
        padGrid.post(() -> {
            int total = padGrid.getWidth();
            if (total <= 0) return;
            int gap = dp(3);
            int size = (total - gap * (W - 1)) / W;
            for (int i = 0; i < CELL_COUNT; i++) {
                GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(i / W), GridLayout.spec(i % W));
                params.width = size;
                params.height = size;
                params.setMargins(i % W == 0 ? 0 : gap, i < W ? 0 : gap, 0, 0);
                cells[i].setLayoutParams(params);
            }
        });
    }

    private void paintCell(int index) {
        if (!multiSelect) Arrays.fill(selected, false);
        selected[index] = !selected[index];
        pixels[index] = scaledColor(selectedColor);
        renderGrid();
    }

    private int scaledColor(int color) {
        return Color.rgb(Color.red(color) * brightness / 255, Color.green(color) * brightness / 255, Color.blue(color) * brightness / 255);
    }

    private void clearSelection() {
        Arrays.fill(selected, false);
        renderGrid();
    }

    private void clearAllPixels() {
        Arrays.fill(pixels, Color.BLACK);
        Arrays.fill(selected, false);
        renderGrid();
    }

    private void renderGrid() {
        for (int i = 0; i < cells.length; i++) {
            if (cells[i] == null) continue;
            int fill = pixels[i];
            int stroke = selected[i] ? BLUE : Color.rgb(188, 197, 207);
            int strokeWidth = selected[i] ? dp(3) : dp(1);
            cells[i].setBackground(rounded(fill, strokeWidth, stroke, dp(5)));
        }
    }

    private void requestBlePermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, 10);
        } else {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 10);
        }
    }

    private boolean hasBlePermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                    && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void scanAndConnect() {
        if (!hasBlePermission()) { requestBlePermissions(); return; }
        if (adapter == null || !adapter.isEnabled()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { toast("No BLE scanner"); return; }
        status.setText("Scanning...");
        scanner.startScan(scanCallback);
        main.postDelayed(() -> {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
            if (gatt == null) status.setText("No Arcade Coder found");
        }, 8000);
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = device.getName() == null ? "" : device.getName();
            boolean likely = name.toLowerCase(Locale.ROOT).contains("arcade") || name.toLowerCase(Locale.ROOT).contains("coder");
            if (!likely && result.getScanRecord() != null && result.getScanRecord().getServiceUuids() != null) {
                likely = result.getScanRecord().getServiceUuids().toString().toLowerCase(Locale.ROOT).contains(Protocol.SERVICE_UUID.toString());
            }
            if (!likely) return;
            try { scanner.stopScan(this); } catch (Exception ignored) {}
            status.setText("Connecting " + (name.isEmpty() ? device.getAddress() : name));
            gatt = device.connectGatt(MainActivity.this, false, gattCallback);
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int statusCode, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.requestMtu(517);
                g.discoverServices();
                main.post(() -> status.setText("Connected"));
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                commandChar = null;
                paintStarted = false;
                main.post(() -> status.setText("Disconnected"));
            }
        }
        @Override public void onServicesDiscovered(BluetoothGatt g, int statusCode) {
            BluetoothGattService service = g.getService(Protocol.SERVICE_UUID);
            commandChar = service == null ? null : service.getCharacteristic(Protocol.COMMAND_CHAR);
            main.post(() -> status.setText(commandChar == null ? "Connected, service not found" : "Connected, ready"));
        }
    };

    private void disconnect() {
        animationRunning = false;
        if (gatt != null) {
            gatt.disconnect();
            gatt.close();
        }
        gatt = null;
        commandChar = null;
        paintStarted = false;
        status.setText("Disconnected");
    }

    private void startPaint() {
        write(Protocol.startBuiltin("paint"));
        paintStarted = true;
        status.setText("Paint start sent");
    }

    private void sendPixels(boolean startIfNeeded) {
        if (startIfNeeded && !paintStarted) {
            startPaint();
            main.postDelayed(() -> sendPixels(false), 1300);
            return;
        }
        byte[] canvas = Protocol.compactCanvasFromDisplayRgb(pixels);
        write(Protocol.compactCanvasCommand(canvas));
        status.setText("Sent " + canvas.length + " byte canvas");
    }

    private void write(byte[] data) {
        if (gatt == null || commandChar == null) { toast("Not connected"); return; }
        commandChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
        commandChar.setValue(data);
        boolean ok = gatt.writeCharacteristic(commandChar);
        if (!ok) toast("BLE write failed to queue");
    }

    private void pickImageFromFiles() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(Intent.createChooser(intent, "Choose image"), 20);
    }

    private void pickImageFromGallery() {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 33) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
        } else {
            intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
            intent.setType("image/*");
        }
        startActivityForResult(intent, 20);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != 20 || resultCode != RESULT_OK || data == null) return;
        try {
            Uri uri = data.getData();
            if (uri == null) return;
            InputStream stream = getContentResolver().openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(stream);
            if (bitmap != null) {
                sourceBitmap = bitmap;
                showImagesPage();
            }
        } catch (Exception e) {
            toast(e.getMessage());
        }
    }

    private void sendImageCrop() {
        if (imageCropView != null) {
            int[] sampled = imageCropView.sample12x12();
            System.arraycopy(sampled, 0, pixels, 0, CELL_COUNT);
            Arrays.fill(selected, false);
        }
        sendPixels(true);
    }

    private Bitmap bitmapFromPixels12() {
        Bitmap bitmap = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) bitmap.setPixel(x, y, pixels[y * W + x]);
        return bitmap;
    }

    private class ImageCropView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private Bitmap bitmap;
        private float scale = 1f;
        private float offsetX = 0f;
        private float offsetY = 0f;
        private float lastX = 0f;
        private float lastY = 0f;
        private float startDistance = 0f;
        private float startScale = 1f;
        private boolean fitMode = false;

        ImageCropView(MainActivity context) {
            super(context);
            setBackgroundColor(Color.rgb(226, 232, 239));
            borderPaint.setColor(Color.rgb(93, 107, 122));
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(dp(2));
        }

        void setBitmap(Bitmap bitmap) {
            this.bitmap = bitmap;
            post(this::resetCrop);
        }

        void resetCrop() {
            fitMode = false;
            resetTransform(false);
        }

        void resetFit() {
            fitMode = true;
            resetTransform(true);
        }

        void zoomBy(float factor) {
            if (bitmap == null) return;
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            float next = clampScale(scale * factor);
            offsetX = cx - (cx - offsetX) * next / scale;
            offsetY = cy - (cy - offsetY) * next / scale;
            scale = next;
            invalidate();
        }

        int[] sample12x12() {
            int[] out = new int[CELL_COUNT];
            Arrays.fill(out, Color.BLACK);
            if (bitmap == null || getWidth() <= 0 || getHeight() <= 0) return out;
            float size = Math.min(getWidth(), getHeight());
            float left = (getWidth() - size) / 2f;
            float top = (getHeight() - size) / 2f;
            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    float viewX = left + (x + 0.5f) * size / W;
                    float viewY = top + (y + 0.5f) * size / H;
                    int srcX = Math.round((viewX - offsetX) / scale);
                    int srcY = Math.round((viewY - offsetY) / scale);
                    if (srcX >= 0 && srcY >= 0 && srcX < bitmap.getWidth() && srcY < bitmap.getHeight()) {
                        int c = bitmap.getPixel(srcX, srcY);
                        out[y * W + x] = Color.rgb(Color.red(c), Color.green(c), Color.blue(c));
                    }
                }
            }
            return out;
        }

        @Override protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int width = MeasureSpec.getSize(widthMeasureSpec);
            if (width <= 0) width = dp(320);
            setMeasuredDimension(width, width);
        }

        @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            super.onSizeChanged(w, h, oldw, oldh);
            resetTransform(fitMode);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float size = Math.min(getWidth(), getHeight());
            float left = (getWidth() - size) / 2f;
            float top = (getHeight() - size) / 2f;
            RectF crop = new RectF(left, top, left + size, top + size);
            canvas.drawColor(Color.rgb(226, 232, 239));
            int save = canvas.save();
            canvas.clipRect(crop);
            canvas.drawColor(Color.rgb(16, 20, 26));
            if (bitmap != null) {
                if (imagePixelPreview) {
                    drawPixelPreview(canvas, crop);
                } else {
                    RectF dest = new RectF(offsetX, offsetY, offsetX + bitmap.getWidth() * scale, offsetY + bitmap.getHeight() * scale);
                    canvas.drawBitmap(bitmap, null, dest, paint);
                }
            }
            canvas.restoreToCount(save);
            canvas.drawRect(crop, borderPaint);
        }

        private void drawPixelPreview(Canvas canvas, RectF crop) {
            int[] sampled = sample12x12();
            float cellW = crop.width() / W;
            float cellH = crop.height() / H;
            Paint pixelPaint = new Paint();
            pixelPaint.setStyle(Paint.Style.FILL);
            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    pixelPaint.setColor(sampled[y * W + x]);
                    canvas.drawRect(crop.left + x * cellW, crop.top + y * cellH, crop.left + (x + 1) * cellW, crop.top + (y + 1) * cellH, pixelPaint);
                }
            }
        }

        @Override public boolean onTouchEvent(MotionEvent event) {
            if (bitmap == null) return true;
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                lastX = event.getX();
                lastY = event.getY();
                return true;
            }
            if (action == MotionEvent.ACTION_POINTER_DOWN && event.getPointerCount() >= 2) {
                startDistance = pointerDistance(event);
                startScale = scale;
                return true;
            }
            if (action == MotionEvent.ACTION_MOVE) {
                if (event.getPointerCount() >= 2) {
                    float distance = pointerDistance(event);
                    if (startDistance > 0f) scale = clampScale(startScale * distance / startDistance);
                } else {
                    offsetX += event.getX() - lastX;
                    offsetY += event.getY() - lastY;
                    lastX = event.getX();
                    lastY = event.getY();
                }
                invalidate();
                return true;
            }
            return true;
        }

        private void resetTransform(boolean fit) {
            if (bitmap == null || getWidth() <= 0 || getHeight() <= 0) return;
            float viewSize = Math.min(getWidth(), getHeight());
            float sx = viewSize / bitmap.getWidth();
            float sy = viewSize / bitmap.getHeight();
            scale = fit ? Math.min(sx, sy) : Math.max(sx, sy);
            offsetX = (getWidth() - bitmap.getWidth() * scale) / 2f;
            offsetY = (getHeight() - bitmap.getHeight() * scale) / 2f;
            invalidate();
        }

        private float clampScale(float value) {
            return Math.max(0.08f, Math.min(24f, value));
        }

        private float pointerDistance(MotionEvent event) {
            float dx = event.getX(0) - event.getX(1);
            float dy = event.getY(0) - event.getY(1);
            return (float)Math.sqrt(dx * dx + dy * dy);
        }
    }

    private void startAnimation(int mode) {
        animationRunning = false;
        animationMode = mode;
        animationStep = 0;
        animationRunning = true;
        animationTick.run();
    }

    private void renderAnimationFrame(int mode, int t) {
        Arrays.fill(pixels, Color.BLACK);
        if (mode == 0) {
            for (int i = 0; i <= t % CELL_COUNT; i++) pixels[i] = scaledColor(selectedColor);
        } else if (mode == 1) {
            int v = 30 + (int)(Math.abs(Math.sin(t * 0.25)) * 225);
            for (int i = 0; i < CELL_COUNT; i++) pixels[i] = Color.rgb(v, 0, 255 - v);
        } else if (mode == 2) {
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
                float hue = ((x * 30 + y * 10 + t * 8) % 360);
                pixels[y * W + x] = Color.HSVToColor(new float[]{hue, 1.0f, brightness / 255f});
            }
        } else if (mode == 3) {
            renderHeart(t);
        } else if (mode == 4) {
            for (int i = 0; i < 18; i++) {
                int index = Math.abs((t * 17 + i * 41) % CELL_COUNT);
                pixels[index] = Color.WHITE;
            }
        } else if (mode == 5) {
            int x = t % (W * 2 - 2);
            if (x >= W) x = W * 2 - 2 - x;
            for (int y = 0; y < H; y++) pixels[y * W + x] = scaledColor(selectedColor);
        } else if (mode == 6) {
            renderTetris(t);
        } else if (mode == 7) {
            renderSnake(t);
        } else if (mode == 8) {
            renderComet(t);
        }
    }

    private void changeAnimationSpeed(int delta) {
        animationDelayMs = Math.max(60, Math.min(1000, animationDelayMs + delta));
        status.setText("Animation speed " + animationDelayMs + " ms");
    }

    private void stopAnimation() {
        animationRunning = false;
        status.setText("Animation stopped");
    }

    private void renderHeart(int t) {
        int pulse = 105 + (int)(Math.abs(Math.sin(t * 0.35)) * 150);
        int color = Color.rgb(pulse, 0, Math.max(25, pulse / 5));
        int[][] coords = {
                {3,2},{4,2},{7,2},{8,2},
                {2,3},{3,3},{4,3},{5,3},{6,3},{7,3},{8,3},{9,3},
                {2,4},{3,4},{4,4},{5,4},{6,4},{7,4},{8,4},{9,4},
                {3,5},{4,5},{5,5},{6,5},{7,5},{8,5},
                {4,6},{5,6},{6,6},{7,6},
                {5,7},{6,7},
                {5,8},{6,8}
        };
        for (int[] xy : coords) pixels[xy[1] * W + xy[0]] = color;
    }

    private void renderTetris(int t) {
        int[][] board = {
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {3,3,0,2,2,2,0,6,6,0,4,0},
                {3,0,0,0,2,0,0,0,6,6,4,0},
                {1,1,1,5,5,0,7,7,7,4,4,0},
                {1,0,0,5,5,0,0,7,0,0,4,0}
        };
        int[] palette = {Color.BLACK, Color.CYAN, Color.rgb(250, 214, 60), Color.rgb(233, 84, 96), Color.rgb(82, 199, 93), Color.rgb(147, 99, 230), Color.rgb(255, 146, 43), Color.rgb(62, 132, 235)};
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) pixels[y * W + x] = dim(palette[board[y][x]], 0.80f);
        int drop = t % 9;
        int shift = (t / 9) % 4;
        int color = Color.HSVToColor(new float[]{(t * 24) % 360, 0.85f, brightness / 255f});
        int baseX = 4 + (shift == 1 ? 1 : shift == 2 ? 2 : 0);
        setPixelSafe(baseX, drop, color);
        setPixelSafe(baseX + 1, drop, color);
        setPixelSafe(baseX, drop + 1, color);
        setPixelSafe(baseX + 1, drop + 1, color);
    }

    private void renderSnake(int t) {
        int[][] path = {
                {1,1},{2,1},{3,1},{4,1},{5,1},{6,1},{7,1},{8,1},{9,1},{10,1},
                {10,2},{10,3},{9,3},{8,3},{7,3},{6,3},{5,3},{4,3},{3,3},{2,3},{1,3},
                {1,4},{1,5},{2,5},{3,5},{4,5},{5,5},{6,5},{7,5},{8,5},{9,5},{10,5},
                {10,6},{10,7},{9,7},{8,7},{7,7},{6,7},{5,7},{4,7},{3,7},{2,7},{1,7},
                {1,8},{1,9},{2,9},{3,9},{4,9},{5,9},{6,9},{7,9},{8,9},{9,9},{10,9}
        };
        int appleIndex = (t / 15) % path.length;
        int[] apple = path[appleIndex];
        setPixelSafe(apple[0], apple[1], Color.rgb(230, 45, 45));
        for (int i = 0; i < 12; i++) {
            int pos = (t + path.length - i) % path.length;
            int[] xy = path[pos];
            int green = Math.max(55, 240 - i * 14);
            setPixelSafe(xy[0], xy[1], Color.rgb(25, green, 65));
        }
    }

    private void renderComet(int t) {
        int cx = t % W;
        int cy = (t / 2) % H;
        for (int i = 0; i < 12; i++) {
            int x = cx - i;
            int y = cy - i / 3;
            if (x < 0) x += W;
            if (y < 0) y += H;
            float value = Math.max(0.08f, (12 - i) / 12f) * brightness / 255f;
            setPixelSafe(x, y, Color.HSVToColor(new float[]{(t * 9 + i * 12) % 360, 0.95f, value}));
        }
    }

    private int dim(int color, float factor) {
        return Color.rgb((int)(Color.red(color) * factor), (int)(Color.green(color) * factor), (int)(Color.blue(color) * factor));
    }

    private void setPixelSafe(int x, int y, int color) {
        if (x >= 0 && y >= 0 && x < W && y < H) pixels[y * W + x] = color;
    }

    private void toast(String message) {
        Toast.makeText(this, message == null ? "Error" : message, Toast.LENGTH_SHORT).show();
    }
}
