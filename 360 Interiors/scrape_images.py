import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import time
import json
import re
import csv  # Import the csv module

def clean_filename(filename):
    """
    Cleans a filename by removing special characters and replacing spaces and underscores with hyphens.

    Args:
        filename (str): The filename to clean.

    Returns:
        str: The cleaned filename.
    """
    name, ext = os.path.splitext(filename)
    name = re.sub(r"[^\w\s-]", "", name).strip()
    name = re.sub(r"[\s_-]+", "-", name)
    name = name.lower()
    return f"{name}{ext}"

def scrape_images(url, headers, base_dir, csv_writer, csvfile):
    """
    Scrapes images from a given URL, extracting project names from the HTML structure
    and organizing them into subfolders based on the URL's path.

    Args:
        url (str): The URL to scrape.
        headers (dict): The headers to use for the request.
        base_dir (str): The base directory for the project.
        csv_writer (csv.writer): The CSV writer object.
        csvfile: The csv file object.
    """
    print(f"scrape_images called for URL: {url}")  # Added print
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
    if not path_parts or path_parts == ['']:
        subfolder_name = "root"
    else:
        subfolder_name = "-".join(path_parts)

    subfolder_name = clean_filename(subfolder_name)

    main_folder_name = "360_images"
    main_folder_path = os.path.join(base_dir, main_folder_name)
    subfolder_path = os.path.join(main_folder_path, subfolder_name)
    os.makedirs(subfolder_path, exist_ok=True)

    image_counter = 1  # Initialize a counter for images without project names

    for container in soup.find_all("div", class_="x-column"):
        a_tag = container.find("a")
        if a_tag:
            project_name_span = a_tag.find("span", class_="heading")
            if project_name_span:
                project_name = project_name_span.text.strip()
            else:
                project_name = None  # Set to None if not found
        else:
            project_name = None  # Set to None if not found

        if project_name is None:
            # Generate a unique filename based on URL and counter
            filename_base = subfolder_name
            filename = f"{filename_base}-{image_counter}"
            image_counter += 1
        else:
            filename = project_name

        filename = clean_filename(filename)

        img = container.find("img")
        if not img:
            print(f"No image found in container for project: {filename}")
            continue

        src = img.get("src")
        print(f"src: {src}")
        if not src or src.startswith("data:"):
            print(f"Skipping image with invalid src in project: {filename}")
            continue

        ext = os.path.splitext(src)[1].split("?")[0]
        if ext == "":
            ext = ".jpg"

        image_url = urljoin(url, src)

        try:
            img_response = requests.get(image_url, headers=headers, timeout=TIMEOUT)
            img_response.raise_for_status()
            img_data = img_response.content
            filepath = os.path.join(subfolder_path, f"{filename}{ext}")
            with open(filepath, "wb") as f:
                f.write(img_data)
            print(f"Downloaded: {filename}{ext} to {subfolder_name}")
            # set_image_metadata(filepath, project_name) # Comment out to test

            # Write data to CSV
            print(f"Writing to CSV: {src}, {parsed_url.path}, {filename}{ext}, {subfolder_name}")
            print(f"parsed_url.path: {parsed_url.path}")
            csv_writer.writerow([src, parsed_url.path, f"{filename}{ext}", subfolder_name]) # Corrected line
            csvfile.flush() # Added line

        except requests.exceptions.RequestException as e:
            print(f"Failed to download {image_url}: {e}")
        except OSError as e:
            print(f"Error saving file {filename}: {e}")

        time.sleep(DELAY)

    print(f"Finished scraping {url}")

def create_sitemap(base_url, headers, base_dir):
    """
    Creates a sitemap of the website by scraping all internal links.

    Args:
        base_url (str): The base URL of the website.
        headers (dict): The headers to use for the request.
        base_dir (str): The base directory for the project.

    Returns:
        set: A set of all internal URLs found.
    """
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
    """
    Extracts the base URL (scheme + netloc) from a list of URLs.

    Args:
        urls (list): A list of URLs.

    Returns:
        str: The base URL, or None if no URLs are provided.
    """
    if not urls:
        return None
    parsed_url = urlparse(urls[0])
    return f"{parsed_url.scheme}://{parsed_url.netloc}"

def scrape_from_sitemap(base_url, headers, base_dir):
    """
    Scrapes images from all URLs found in the sitemap.

    Args:
        base_url (str): The base URL of the website.
        headers (dict): The headers to use for the request.
        base_dir (str): The base directory for the project.
    """
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
    # Create the 360_images directory if it doesn't exist
    os.makedirs(main_folder_path, exist_ok=True)
    csv_filepath = os.path.join(main_folder_path, "all_image_data.csv")

    with open(csv_filepath, "w", newline="", encoding="utf-8") as csvfile:
        csv_writer = csv.writer(csvfile)
        csv_writer.writerow(["Old Name", "URL", "New Name", "Folder Name"])  # Write header row

        for url in sitemap:
            scrape_images(url, headers, base_dir, csv_writer, csvfile) # Added csvfile

if __name__ == "__main__":
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # Get the base URL from the user
    base_url = input("Enter the base URL of the website: ")

    # Scrape images from the sitemap
    scrape_from_sitemap(base_url, headers, base_dir)
    print("Finished scraping images from sitemap.")
