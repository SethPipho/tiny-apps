class ImageAnnotationApp {
    constructor() {
        this.canvas = document.getElementById('annotationCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.image = document.getElementById('uploadedImage');
        this.imageInput = document.getElementById('imageInput');
        
        this.annotations = [];
        this.currentTool = 'select';
        this.isDrawing = false;
        this.currentPath = [];
        this.imageLoaded = false;
        this.selectedAnnotation = null;
        
        this.setupEventListeners();
        this.setupCanvas();
    }
    
    setupEventListeners() {
        this.imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('annotationsInput').addEventListener('change', (e) => this.handleAnnotationsLoad(e));
        
        document.getElementById('selectTool').addEventListener('click', () => this.setTool('select'));
        document.getElementById('lineTool').addEventListener('click', () => this.setTool('line'));
        document.getElementById('polygonTool').addEventListener('click', () => this.setTool('polygon'));
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportAnnotations());
        document.getElementById('toggleSidebar').addEventListener('click', () => this.toggleSidebar());
        
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', (e) => this.stopDrawing(e));
        this.canvas.addEventListener('dblclick', (e) => this.finishPolygon(e));
    }
    
    setupCanvas() {
        this.canvas.width = 800;
        this.canvas.height = 600;
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    }
    
    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.image.src = e.target.result;
            this.image.onload = () => {
                this.imageLoaded = true;
                this.resizeCanvasToImage();
                this.redraw();
            };
        };
        reader.readAsDataURL(file);
    }
    
    handleAnnotationsLoad(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedAnnotations = JSON.parse(e.target.result);
                
                if (!Array.isArray(loadedAnnotations)) {
                    alert('Invalid annotations file: must be an array of annotations');
                    return;
                }
                
                // Validate each annotation
                const validAnnotations = [];
                for (const annotation of loadedAnnotations) {
                    if (this.validateAnnotation(annotation)) {
                        validAnnotations.push(annotation);
                    } else {
                        console.warn('Skipping invalid annotation:', annotation);
                    }
                }
                
                if (validAnnotations.length === 0) {
                    alert('No valid annotations found in file');
                    return;
                }
                
                // Ask user if they want to replace or append
                const replace = confirm(`Load ${validAnnotations.length} annotations?\nOK = Replace existing\nCancel = Add to existing`);
                
                if (replace) {
                    this.annotations = validAnnotations;
                } else {
                    this.annotations.push(...validAnnotations);
                }
                
                this.selectedAnnotation = null;
                this.updateAnnotationsList();
                this.redraw();
                
                alert(`Successfully loaded ${validAnnotations.length} annotations`);
                
            } catch (error) {
                alert('Error loading annotations: Invalid JSON file');
                console.error('Annotation load error:', error);
            }
        };
        reader.readAsText(file);
        
        // Clear the input so the same file can be loaded again
        event.target.value = '';
    }
    
    validateAnnotation(annotation) {
        if (!annotation || typeof annotation !== 'object') {
            return false;
        }
        
        if (!annotation.geometry || !annotation.geometry.type || !annotation.geometry.coordinates) {
            return false;
        }
        
        const { type, coordinates } = annotation.geometry;
        
        if (type === 'LineString') {
            return Array.isArray(coordinates) && 
                   coordinates.length >= 2 &&
                   coordinates.every(coord => Array.isArray(coord) && coord.length === 2 && 
                                   typeof coord[0] === 'number' && typeof coord[1] === 'number');
        }
        
        if (type === 'Polygon') {
            return Array.isArray(coordinates) && 
                   coordinates.length >= 1 &&
                   Array.isArray(coordinates[0]) &&
                   coordinates[0].length >= 3 &&
                   coordinates[0].every(coord => Array.isArray(coord) && coord.length === 2 && 
                                      typeof coord[0] === 'number' && typeof coord[1] === 'number');
        }
        
        return false;
    }
    
    resizeCanvasToImage() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth - 64; // Account for padding
        const containerHeight = container.clientHeight - 200; // Account for instructions and padding
        
        const maxWidth = Math.min(800, containerWidth);
        const maxHeight = Math.min(600, containerHeight);
        
        let { width, height } = this.image;
        
        if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width *= scale;
            height *= scale;
        }
        
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.imageScale = width / this.image.naturalWidth;
    }
    
    setTool(tool) {
        this.currentTool = tool;
        this.currentPath = [];
        this.isDrawing = false;
        
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tool + 'Tool').classList.add('active');
    }
    
    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }
    
    handleCanvasClick(event) {
        if (!this.imageLoaded) return;
        
        const pos = this.getMousePos(event);
        
        if (this.currentTool === 'select') {
            // Check if clicking on existing annotation for selection
            const clickedAnnotation = this.getAnnotationAtPoint(pos);
            if (clickedAnnotation !== null) {
                this.selectAnnotation(clickedAnnotation);
                return;
            }
            
            // Clear selection if clicking elsewhere
            this.selectedAnnotation = null;
            this.redraw();
            return;
        }
        
        // For drawing tools, clear selection and start drawing
        if (this.currentTool === 'line' || this.currentTool === 'polygon') {
            this.selectedAnnotation = null;
            this.startDrawing(event);
        }
    }
    
    startDrawing(event) {
        if (!this.imageLoaded) return;
        
        const pos = this.getMousePos(event);
        
        if (this.currentTool === 'line') {
            if (!this.isDrawing) {
                this.isDrawing = true;
                this.currentPath = [pos];
            } else {
                this.currentPath.push(pos);
            }
        } else if (this.currentTool === 'polygon') {
            if (!this.isDrawing) {
                this.isDrawing = true;
                this.currentPath = [pos];
            } else {
                this.currentPath.push(pos);
            }
        }
        
        this.redraw();
    }
    
    draw(event) {
        if (!this.imageLoaded || !this.isDrawing) return;
        
        const pos = this.getMousePos(event);
        
        if (this.currentTool === 'line' && this.currentPath.length > 0) {
            this.redraw();
            this.drawPreviewLine(this.currentPath[this.currentPath.length - 1], pos);
        } else if (this.currentTool === 'polygon' && this.currentPath.length > 0) {
            this.redraw();
            this.drawPreviewPolygon(pos);
        }
    }
    
    stopDrawing() {
        // Remove mouseup behavior for line tool since we use click-based drawing
    }
    
    finishPolygon() {
        if (!this.imageLoaded || !this.isDrawing) return;
        
        if (this.currentTool === 'polygon' && this.currentPath.length >= 3) {
            this.saveAnnotation();
            this.isDrawing = false;
            this.currentPath = [];
        } else if (this.currentTool === 'line' && this.currentPath.length >= 2) {
            this.saveAnnotation();
            this.isDrawing = false;
            this.currentPath = [];
        }
    }
    
    saveAnnotation() {
        if (this.currentPath.length === 0) return;
        
        let properties = {};
        
        const annotation = {
            properties: properties,
            geometry: {
                type: this.currentTool === 'line' ? 'LineString' : 'Polygon',
                coordinates: this.currentTool === 'line' 
                    ? this.currentPath.map(p => [p.x / this.imageScale, p.y / this.imageScale])
                    : [this.currentPath.map(p => [p.x / this.imageScale, p.y / this.imageScale])]
            }
        };
        
        this.annotations.push(annotation);
        this.updateAnnotationsList();
        this.redraw();
    }
    
    drawPreviewLine(start, end) {
        this.ctx.beginPath();
        this.ctx.setLineDash([5, 5]);
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    drawPreviewPolygon(currentPos) {
        if (this.currentPath.length < 1) return;
        
        this.ctx.beginPath();
        this.ctx.setLineDash([5, 5]);
        this.ctx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
        
        for (let i = 1; i < this.currentPath.length; i++) {
            this.ctx.lineTo(this.currentPath[i].x, this.currentPath[i].y);
        }
        
        this.ctx.lineTo(currentPos.x, currentPos.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.imageLoaded) {
            this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
        }
        
        this.annotations.forEach((annotation, index) => {
            const isSelected = this.selectedAnnotation === index;
            this.drawAnnotation(annotation, isSelected);
        });
        
        if (this.isDrawing && this.currentPath.length > 0) {
            this.drawCurrentPath();
        }
    }
    
    drawAnnotation(annotation, isSelected = false) {
        const coords = annotation.geometry.coordinates;
        const strokeColor = isSelected ? '#00ff00' : '#ff0000';
        const fillAlpha = isSelected ? 0.5 : 0.3;
        
        if (annotation.geometry.type === 'LineString') {
            this.ctx.beginPath();
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.moveTo(coords[0][0] * this.imageScale, coords[0][1] * this.imageScale);
            for (let i = 1; i < coords.length; i++) {
                this.ctx.lineTo(coords[i][0] * this.imageScale, coords[i][1] * this.imageScale);
            }
            this.ctx.stroke();
        } else if (annotation.geometry.type === 'Polygon') {
            const ring = coords[0];
            this.ctx.beginPath();
            this.ctx.moveTo(ring[0][0] * this.imageScale, ring[0][1] * this.imageScale);
            for (let i = 1; i < ring.length; i++) {
                this.ctx.lineTo(ring[i][0] * this.imageScale, ring[i][1] * this.imageScale);
            }
            this.ctx.closePath();
            this.ctx.fillStyle = isSelected ? `rgba(0, 255, 0, ${fillAlpha})` : `rgba(255, 0, 0, ${fillAlpha})`;
            this.ctx.fill();
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.stroke();
        }
    }
    
    drawCurrentPath() {
        if (this.currentPath.length === 0) return;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        this.ctx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
        
        for (let i = 1; i < this.currentPath.length; i++) {
            this.ctx.lineTo(this.currentPath[i].x, this.currentPath[i].y);
        }
        
        if (this.currentTool === 'polygon' && this.currentPath.length > 2) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            this.ctx.fill();
        }
        
        this.ctx.stroke();
    }
    
    updateAnnotationsList() {
        const listContainer = document.getElementById('annotationsList');
        listContainer.innerHTML = '';
        
        this.annotations.forEach((annotation, index) => {
            const item = document.createElement('div');
            const isSelected = this.selectedAnnotation === index;
            item.className = `annotation-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="annotation-header">
                    <span>${annotation.geometry.type} #${index + 1}</span>
                    <div class="annotation-buttons">
                        <button onclick="app.removeAnnotation(${index})">Remove</button>
                    </div>
                </div>
                <div class="annotation-properties-display">
                    ${this.formatPropertiesDisplay(annotation.properties)}
                </div>
                ${isSelected ? this.createInlinePropertyEditor(index) : ''}
            `;
            
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.property-editor') && !e.target.closest('.annotation-buttons')) {
                    this.selectAnnotation(index);
                }
            });
            listContainer.appendChild(item);
            
            // Setup inline editor if this annotation is selected
            if (isSelected) {
                this.setupInlinePropertyEditor(index);
            }
        });
    }
    
    formatPropertiesDisplay(properties) {
        if (Object.keys(properties).length === 0) {
            return '<em style="color: #6c757d; font-size: 0.75rem;">No properties</em>';
        }
        
        return Object.entries(properties)
            .map(([key, value]) => `<div class="property-display"><strong>${key}:</strong> ${value}</div>`)
            .join('');
    }
    
    createInlinePropertyEditor(index) {
        return `
            <div class="property-editor">
                <div class="property-editor-header">
                    <span>Properties</span>
                    <button onclick="app.addPropertyToAnnotation(${index})" class="add-property-btn">Add Property</button>
                </div>
                <div class="property-list" id="propertyList-${index}"></div>
            </div>
        `;
    }
    
    setupInlinePropertyEditor(index) {
        const annotation = this.annotations[index];
        const propertyList = document.getElementById(`propertyList-${index}`);
        
        // Populate existing properties
        propertyList.innerHTML = '';
        Object.entries(annotation.properties).forEach(([key, value]) => {
            this.createInlinePropertyRow(index, key, value);
        });
    }
    
    createInlinePropertyRow(index, key = '', value = '') {
        const propertyList = document.getElementById(`propertyList-${index}`);
        const propertyRow = document.createElement('div');
        propertyRow.className = 'property-row';
        propertyRow.innerHTML = `
            <input type="text" class="property-key" value="${key}" placeholder="Property name">
            <input type="text" class="property-value" value="${value}" placeholder="Property value">
            <button class="remove-property" onclick="app.removePropertyRow(this, ${index})">×</button>
        `;
        
        // Add change listeners for immediate saving
        const keyInput = propertyRow.querySelector('.property-key');
        const valueInput = propertyRow.querySelector('.property-value');
        
        keyInput.addEventListener('input', () => this.saveAnnotationProperties(index));
        valueInput.addEventListener('input', () => this.saveAnnotationProperties(index));
        keyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                valueInput.focus();
            }
        });
        valueInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addPropertyToAnnotation(index);
            }
        });
        
        propertyList.appendChild(propertyRow);
        
        // Focus on key input if it's empty (new property)
        if (!key) {
            keyInput.focus();
        }
    }
    
    addPropertyToAnnotation(index) {
        this.createInlinePropertyRow(index, '', '');
    }
    
    removePropertyRow(button, index) {
        button.parentElement.remove();
        this.saveAnnotationProperties(index);
    }
    
    saveAnnotationProperties(index) {
        const propertyList = document.getElementById(`propertyList-${index}`);
        if (!propertyList) return; // Guard against timing issues
        
        const propertyRows = propertyList.querySelectorAll('.property-row');
        
        const properties = {};
        propertyRows.forEach(row => {
            const key = row.querySelector('.property-key').value.trim();
            const value = row.querySelector('.property-value').value.trim();
            
            if (key) {
                properties[key] = value;
            }
        });
        
        this.annotations[index].properties = properties;
        
        // Update the properties display without recreating the entire list
        const propertyDisplay = document.querySelector(`.annotation-item.selected .annotation-properties-display`);
        if (propertyDisplay) {
            propertyDisplay.innerHTML = this.formatPropertiesDisplay(properties);
        }
    }
    
    getAnnotationAtPoint(point) {
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const annotation = this.annotations[i];
            if (this.isPointInAnnotation(point, annotation)) {
                return i;
            }
        }
        return null;
    }
    
    isPointInAnnotation(point, annotation) {
        const coords = annotation.geometry.coordinates;
        
        if (annotation.geometry.type === 'LineString') {
            // Check if point is near the line (within 5 pixels)
            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = { x: coords[i][0] * this.imageScale, y: coords[i][1] * this.imageScale };
                const p2 = { x: coords[i + 1][0] * this.imageScale, y: coords[i + 1][1] * this.imageScale };
                if (this.distanceToLine(point, p1, p2) < 5) {
                    return true;
                }
            }
        } else if (annotation.geometry.type === 'Polygon') {
            // Use point-in-polygon algorithm
            const ring = coords[0].map(coord => ({ x: coord[0] * this.imageScale, y: coord[1] * this.imageScale }));
            return this.pointInPolygon(point, ring);
        }
        
        return false;
    }
    
    distanceToLine(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }
        
        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    pointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
                (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    }
    
    selectAnnotation(index) {
        this.selectedAnnotation = index;
        this.updateAnnotationsList();
        this.redraw();
    }
    
    
    removeAnnotation(index) {
        this.annotations.splice(index, 1);
        if (this.selectedAnnotation === index) {
            this.selectedAnnotation = null;
        } else if (this.selectedAnnotation > index) {
            this.selectedAnnotation--;
        }
        this.updateAnnotationsList();
        this.redraw();
    }
    
    clearAll() {
        this.annotations = [];
        this.currentPath = [];
        this.isDrawing = false;
        this.updateAnnotationsList();
        this.redraw();
    }
    
    exportAnnotations() {
        const dataStr = JSON.stringify(this.annotations, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'annotations.json';
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    
    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const toggleBtn = document.getElementById('toggleSidebar');
        
        sidebar.classList.toggle('collapsed');
        
        if (sidebar.classList.contains('collapsed')) {
            toggleBtn.textContent = '→';
        } else {
            toggleBtn.textContent = '←';
        }
    }
}

const app = new ImageAnnotationApp();