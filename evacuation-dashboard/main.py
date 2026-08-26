import cv2 as cv
import numpy as np
import urllib.request
import time
import socket

# ================= STREAM =================
URL_STREAM = "http://192.168.4.1:81/stream"

HOST = "127.0.0.1"
PORT = 5055

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((HOST, PORT))

def send_to_unity(area_ratio, people_count, flow):
    msg = f"{area_ratio:.4f},{people_count},{flow}\n"
    sock.send(msg.encode())


def start_stream():
    print("Connecting to ESP32-CAM stream...")

    # Connect to stream
    stream = None
    while stream is None:
        try:
            stream = urllib.request.urlopen(URL_STREAM, timeout=5)
            print("Connected to stream")
        except:
            print("Retrying...")
            time.sleep(1)

    bytes_data = b''
    prev_people_count = 0

    while True:
        try:
            bytes_data += stream.read(2048)
            a = bytes_data.find(b'\xff\xd8')
            b = bytes_data.find(b'\xff\xd9')

            if a != -1 and b != -1:
                jpg = bytes_data[a:b + 2]
                bytes_data = bytes_data[b + 2:]

                frame = cv.imdecode(
                    np.frombuffer(jpg, dtype=np.uint8),
                    cv.IMREAD_COLOR
                )

                if frame is None:
                    continue

                gray = cv.cvtColor(frame, cv.COLOR_BGR2GRAY)

                # ===== ROI =====
                roi = np.zeros_like(gray)
                cv.rectangle(
                    roi,
                    (50, 50),
                    (frame.shape[1] - 50, frame.shape[0] - 50),
                    255,
                    -1
                )
                white_area = cv.countNonZero(roi)

                blurred = cv.GaussianBlur(gray, (7, 7), 0)
                _, mask = cv.threshold(
                    blurred,
                    100,
                    255,
                    cv.THRESH_BINARY_INV
                )

                kernel = np.ones((5, 5), np.uint8)
                mask = cv.morphologyEx(mask, cv.MORPH_OPEN, kernel)
                mask = cv.bitwise_and(mask, roi)

                # ===== Find contours =====
                contours, _ = cv.findContours(
                    mask,
                    cv.RETR_EXTERNAL,
                    cv.CHAIN_APPROX_SIMPLE
                )

                total_area = 0
                people_count = 0

                for c in contours:
                    a = cv.contourArea(c)
                    peri = cv.arcLength(c, True)

                    if peri == 0:
                        continue

                    circ = (4 * np.pi * a) / (peri * peri)

                    if a > 500 and circ > 0.6:
                        total_area += a
                        people_count += 1
                        x, y, w, h = cv.boundingRect(c)
                        cv.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 255), 2)

                # ===== Calculate metrics =====
                area_ratio = total_area / white_area if white_area else 0
                flow = people_count - prev_people_count
                prev_people_count = people_count

                # ===== Display metrics =====
                cv.putText(
                    frame,
                    f"Area Ratio: {area_ratio:.4f}",
                    (10, 30),
                    cv.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 0),
                    2
                )

                cv.putText(
                    frame,
                    f"People Count: {people_count}",
                    (10, 60),
                    cv.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 255),
                    2
                )

                cv.putText(
                    frame,
                    f"Flow: {flow:+d}",
                    (10, 90),
                    cv.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 255),
                    2
                )

                print(f"Area Ratio: {area_ratio:.4f}, People Count: {people_count}, Flow: {flow}")
                send_to_unity(area_ratio, people_count, flow)

                cv.imshow("ESP32 Analysis", frame)

            if cv.waitKey(1) & 0xFF == ord('q'):
                break

        except Exception as e:
            print("Stream error:", e)
            break

    cv.destroyAllWindows()


if __name__ == "__main__":
    start_stream()
