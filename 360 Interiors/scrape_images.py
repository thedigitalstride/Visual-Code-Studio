import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import time
import json
import re
import csv
import shutil  # Import shutil for file operations

def clean_filename(filename):
    """Cleans a filename by removing special characters and replacing spaces/underscores with hyphens."""
    name, ext = os.path.splitext(filename)
    name = re.sub(r"[^\w\s-]", "", name).strip()
    name = re.sub(r"[\s_-]+", "-", name)
    name = name.lower()
    return f"{name}{ext}"

def download_or_replace_image(image_url, local_filepath, headers):
    """
    Downloads an image from a URL, or replaces an existing image if it's a different size.

    Args:
        image_url: The URL of the image to download.
        local_filepath: The local path where the image should be saved.
        headers: The headers to use for the request.
    """
    try:
        # Check if the file already exists
        if os.path.exists(local_filepath):
            # Get the existing file's size
            existing_size = os.path.getsize(local_filepath)

            # Get the remote file's size
            head_response = requests.head(image_url, headers=headers)
            head_response.raise_for_status()
            remote_size = int(head_response.headers.get('Content-Length', 0))

            # Compare sizes
            if existing_size == remote_size:
                print(f"Image '{local_filepath}' already exists and is the correct size. Skipping download.")
                return  # Skip download
            else:
                print(f"Image '{local_filepath}' exists but is a different size. Replacing...")
                #remove the file before writing the new one.
                os.remove(local_filepath)

        # Download the image (if it doesn't exist or needs replacement)
        response = requests.get(image_url, headers=headers, stream=True)
        response.raise_for_status()

        # Write the image to the local file
        with open(local_filepath, 'wb') as file:
            shutil.copyfileobj(response.raw, file)

        print(f"Image downloaded and saved to '{local_filepath}'.")

    except requests.exceptions.RequestException as e:
        print(f"Error downloading image from '{image_url}': {e}")
    except Exception as e:
        print(f"An error occurred while processing '{image_url}': {e}")

def scrape_images(url, headers, base_dir, csv_writer, csvfile):
    """Scrapes images from a given URL, extracting project names and organizing them into subfolders."""
    print(f"scrape_images called for URL: {url}")
    TIMEOUT = 10
    DELAY = 1

    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL {url}: {e}")
        return

    parsed_url = urlparse(url)
    path_parts = parsed_url.path.strip("/").split("/")
    subfolder_name = "root" if not path_parts or path_parts == [''] else "-".join(path_parts)
    subfolder_name = clean_filename(subfolder_name)

    main_folder_name = "360_images"
    main_folder_path = os.path.join(base_dir, main_folder_name)
    subfolder_path = os.path.join(main_folder_path, subfolder_name)
    os.makedirs(subfolder_path, exist_ok=True)

    image_counter = 1

    for container in soup.find_all("div", class_="x-column"):
        a_tag = container.find("a")
        project_name_span = a_tag.find("span", class_="heading") if a_tag else None
        project_name = project_name_span.text.strip() if project_name_span else None

        filename = subfolder_name if project_name is None else project_name
        filename = clean_filename(filename)

        if project_name is None:
            filename = f"{filename}-{image_counter}"
            image_counter += 1

        img = container.find("img")
        if not img:
            print(f"No image found in container for project: {filename}")
            continue

        src = img.get("src")
        if not src or src.startswith("data:"):
            print(f"Skipping image with invalid src in project: {filename}")
            continue

        ext = os.path.splitext(src)[1].split("?")[0] or ".jpg"
        image_url = urljoin(url, src)
        filepath = os.path.join(subfolder_path, f"{filename}{ext}")

        # Use the new function to download or replace the image
        download_or_replace_image(image_url, filepath, headers)

        # Write data to CSV
        print(f"Writing to CSV: {src}, {parsed_url.path}, {filename}{ext}, {subfolder_name}")
        csv_writer.writerow([src, parsed_url.path, f"{filename}{ext}", subfolder_name])
        csvfile.flush()

        time.sleep(DELAY)

    print(f"Finished scraping {url}")

def create_sitemap(base_url, headers, base_dir):
    """Creates a sitemap of the website by scraping all internal links."""
    sitemap = set()
    to_visit = {base_url}
    visited = set()

    while to_visit:
        url = to_visit.pop()
        if url in visited:
            continue
        visited.add(url)

        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")
        except requests.exceptions.RequestException as e:
            print(f"Error fetching URL {url}: {e}")
            continue

        sitemap.add(url)

        for link in soup.find_all("a", href=True):
            absolute_url = urljoin(base_url, link["href"])
            parsed_absolute_url = urlparse(absolute_url)
            parsed_base_url = urlparse(base_url)

            if parsed_absolute_url.netloc == parsed_base_url.netloc:
                if absolute_url not in sitemap and absolute_url not in to_visit and absolute_url not in visited:
                    to_visit.add(absolute_url)

    return sitemap

def extract_base_url(urls):
    """Extracts the base URL (scheme + netloc) from a list of URLs."""
    if not urls:
        return None
    parsed_url = urlparse(urls[0])
    return f"{parsed_url.scheme}://{parsed_url.netloc}"

def scrape_from_sitemap(base_url, headers, base_dir):
    """Scrapes images from all URLs found in the sitemap."""
    sitemap_filepath = os.path.join(base_dir, "sitemap.json")
    if not os.path.exists(sitemap_filepath):
        print("Sitemap file not found. Creating sitemap...")
        sitemap = create_sitemap(base_url, headers, base_dir)
        with open(sitemap_filepath, "w") as f:
            json.dump(list(sitemap), f, indent=4)
        print(f"Sitemap saved to {sitemap_filepath}")
    else:
        with open(sitemap_filepath, "r") as f:
            sitemap = json.load(f)
        print("Sitemap loaded from file.")

    main_folder_name = "360_images"
    main_folder_path = os.path.join(base_dir, main_folder_name)
    os.makedirs(main_folder_path, exist_ok=True)
    csv_filepath = os.path.join(main_folder_path, "all_image_data.csv")

    with open(csv_filepath, "w", newline="", encoding="utf-8") as csvfile:
        csv_writer = csv.writer(csvfile)
        csv_writer.writerow(["Old Name", "URL", "New Name", "Folder Name"])

        for url in sitemap:
            scrape_images(url, headers, base_dir, csv_writer, csvfile)

if __name__ == "__main__":
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    base_dir = os.path.dirname(os.path.abspath(__file__))
    base_url = input("Enter the base URL of the website: ")
    scrape_from_sitemap(base_url, headers, base_dir)
    print("Finished scraping images from sitemap.")
